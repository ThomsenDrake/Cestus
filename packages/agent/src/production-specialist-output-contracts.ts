import { z } from "zod";
import { assertAgentSecretSafeText } from "./secret-safety.js";
import type { AgentSpecialistRunType } from "./specialists.js";

type ProductionRunType = Exclude<AgentSpecialistRunType, "ontology-bootstrap">;

const normalizeAuthorityClaimText = (value: string) => value
  .replace(/\bp(?:[^a-zA-Z0-9]+)r(?:[^a-zA-Z0-9]+)r\b/gi, "PRR")
  .replace(/[^a-zA-Z0-9,;.!?]+/g, " ")
  .replace(/\s+/g, " ")
  .trim()
  .toLowerCase();

const hasSubjectAction = (value: string, subject: RegExp, action: RegExp) => subject.test(value) && action.test(value);
const completionTerm = /\b(?:completed|complete|completion|recorded)\b/;

const hasInstructionBeforeAction = (value: string, instructionModal: RegExp, action: RegExp) => {
  const instructionMatch = instructionModal.exec(value);
  const actionMatch = action.exec(value);

  return instructionMatch !== null && actionMatch !== null && instructionMatch.index < actionMatch.index;
};

const hasCompletedPassiveAction = (value: string, subject: RegExp, action: RegExp) =>
  hasSubjectAction(
    value,
    subject,
    new RegExp(`\\b(?:was|were|has been|have been|had been)\\s+(?:${action.source})`, action.flags)
  );

const hasPronounCompletedPassiveAction = (value: string, action: RegExp) =>
  new RegExp(`\\b(?:it|this|that|they|these|those)\\s+(?:was|were|has been|have been|had been)\\s+(?:${action.source})`, action.flags).test(value);

const hasDirectSubjectAction = (value: string, subject: RegExp, action: RegExp) =>
  new RegExp(`${subject.source}\\s+(?:(?:is|are|was|were|has been|have been|had been|has|have|had)\\s+)?(?:${action.source})`, action.flags).test(value);

const hasDirectOrFirstPersonSubjectAction = (value: string, subject: RegExp, action: RegExp) =>
  hasDirectSubjectAction(value, subject, action) ||
  new RegExp(`\\b(?:i|we)\\s+(?:${action.source})\\s+(?:(?:the|a|an|this|that|one|two|three|several|multiple|\\d+)\\s+)?(?:${subject.source})`, action.flags).test(value);

const hasAuthorityEffectUnlessInstruction = (
  value: string,
  subject: RegExp,
  action: RegExp,
  actionMatcher = hasSubjectAction
) => {
  const instructionModal = /\b(?:should|must|may|might|can|could|would|will)\b/;
  const clauses = value.split(/[,;.!?]+/);

  return clauses.some((clause, index) =>
    hasCompletedPassiveAction(clause, subject, action) ||
    (index > 0 && subject.test(clauses[index - 1]!) && hasPronounCompletedPassiveAction(clause, action)) ||
    (actionMatcher(clause, subject, completionTerm) && !hasInstructionBeforeAction(clause, instructionModal, completionTerm)) ||
    (actionMatcher(clause, subject, action) && !hasInstructionBeforeAction(clause, instructionModal, action))
  );
};

const hasCompletedNominalizedAuthorityEffect = (
  value: string,
  subject: RegExp,
  nominalization: RegExp
) => {
  const instructionModal = /\b(?:should|must|may|might|can|could|would|will)\b/;
  const completionSemantics = /\b(?:(?:has|have|had)\s+(?:occurred|taken place|been completed)|(?:is|are|was|were)\s+(?:complete|completed|final|effective)|occurred|completed|took place)\b/;
  return value.split(/[,;.!?]+/).some((clause) =>
    hasSubjectAction(clause, subject, nominalization) &&
    completionSemantics.test(clause) &&
    !hasInstructionBeforeAction(clause, instructionModal, nominalization)
  );
};

const hasCompletedPrrEffect = (value: string) =>
  hasSubjectAction(
    value,
    /\b(?:prr|public records request|request|response)\b/,
    /\b(?:was|were|has been|have been|had been)\s+(?:sent|emailed|mailed|faxed|filed|submitted|delivered|dispatched|transferred|uploaded|published)\b/
  ) || hasAuthorityEffectUnlessInstruction(
    value,
    /\b(?:prr|public records request|request|response)\b/,
    /\b(?:sent|emailed|mailed|faxed|filed|submitted|delivered|dispatched|transferred|uploaded|published)\b/
  );

const hasAuthorityClaim = (value: string) => {
  const normalized = normalizeAuthorityClaimText(value);

  return (
    hasCompletedPrrEffect(normalized) ||
    hasAuthorityEffectUnlessInstruction(normalized, /\b(?:legal escalation|escalation)\b/, /\b(?:performed|executed|sent|filed|escalated|approved)\b/) ||
    hasAuthorityEffectUnlessInstruction(normalized, /\b(?:provider(?: byte)? transfers?|provider bytes?)\b/, /\b(?:approv(?:e|ed)|grant(?:ed)?|complet(?:ed|ion)|performed|transferred|authori[sz](?:e|ed|ation))\b/) ||
    hasAuthorityEffectUnlessInstruction(normalized, /\b(?:tasks?|review task)\b/, /\b(?:created|launched)\b/, hasDirectOrFirstPersonSubjectAction) ||
    hasAuthorityEffectUnlessInstruction(normalized, /\b(?:portal|sites?)\b/, /\b(?:crawled|scraped)\b/, hasDirectOrFirstPersonSubjectAction) ||
    hasAuthorityEffectUnlessInstruction(normalized, /\b(?:report|packet|publication|export|evidence)\b/, /\b(?:exported|published)\b/, hasDirectOrFirstPersonSubjectAction) ||
    hasAuthorityEffectUnlessInstruction(normalized, /\b(?:repair|remediation)\b/, /\b(?:performed|executed|ran successfully)\b/) ||
    hasAuthorityEffectUnlessInstruction(normalized, /\b(?:graph|ontology|assertion|relationship)\b/, /\baccepted\b/) ||
    hasAuthorityEffectUnlessInstruction(
      normalized,
      /\bassertions?\b/,
      /\b(?:reject(?:ed)?|contest(?:ed)?|supersed(?:e|ed))\b/
    ) ||
    hasAuthorityEffectUnlessInstruction(normalized, /\bclaims?\b/, /\brelink(?:ed)?\b/) ||
    hasCompletedNominalizedAuthorityEffect(
      normalized,
      /\bassertions?\b/,
      /\b(?:rejection|contestation|supersession)\b/
    ) ||
    hasCompletedNominalizedAuthorityEffect(normalized, /\bclaims?\b/, /\brelinking\b/) ||
    hasAuthorityEffectUnlessInstruction(normalized, /\b(?:entity|entities|relationship)\b/, /\b(?:resolved|accepted)\b/) ||
    hasAuthorityEffectUnlessInstruction(normalized, /\b(?:legal|export|governance )?lock\b/, /\bcleared\b/)
  );
};
const hasRawProviderError = (value: string) =>
  (/\b(?:provider|model|api|openai|nous)\b/i.test(value) &&
    /\b(?:diagnostic|failure|failed|error|exception|stack|timeout|timed out|rate[ -]?limit(?:ed)?|status|https?|response(?:[ -]?body)?)\b/i.test(value)) ||
  /\b[a-z][a-z0-9_-]{2,}\s+(?:diagnostic|failure|failed|error|exception|timeout|timed out)\s*:/i.test(value) ||
  /\b(?:error|errors|exception|failure|failures|failed|timeout|timeouts|timed out)\s*:\s*\S/i.test(value) ||
  /\bhttps?\s+\d{3}\s*:/i.test(value);
const hasHiddenLocalPath = (value: string) =>
  /\bfile:\/\/\//i.test(value) ||
  /(?:^|[\s("'])\/(?!\/)(?:[^/\s]+\/)+[^/\s]+/.test(value) ||
  /\b[a-z]:[\\/]Users[\\/][^\\/\s]+(?:[\\/][^\\/\s]+)*/i.test(value);
const hasAuthenticationHeader = (value: string) =>
  /\b(?:authorization|proxy-authorization|authentication|auth|cookie|set-cookie|(?:x-)?(?:api[-_]?key|auth(?:entication)?|access[-_]?token|session(?:[-_]?id)?|token))\s*[:=]/i.test(value);
const safeText = (label: string) => z.string().min(1).max(2_000).superRefine((value, ctx) => {
  try {
    assertAgentSecretSafeText(value, label);
  } catch {
    ctx.addIssue({ code: "custom", message: `${label} must be secret-safe` });
  }
  if (hasAuthorityClaim(value)) {
    ctx.addIssue({ code: "custom", message: `${label} must not claim authority, an external effect, or accepted ontology truth` });
  }
  if (hasRawProviderError(value)) {
    ctx.addIssue({ code: "custom", message: `${label} must not include a raw provider error` });
  }
  if (hasHiddenLocalPath(value)) {
    ctx.addIssue({ code: "custom", message: `${label} must not include a hidden local path` });
  }
  if (hasAuthenticationHeader(value)) {
    ctx.addIssue({ code: "custom", message: `${label} must be secret-safe` });
  }
});
const shortSafeText = (label: string) => safeText(label).max(500);
const id = (prefix: string) => safeText(`${prefix} identifier`).regex(new RegExp(`^${prefix}[a-zA-Z0-9_-]+$`));
const canonicalReferencePattern = /^(?:sha256:[a-f0-9]{64}|(?=[a-zA-Z0-9._:-]{3,200}$)(?=[a-zA-Z0-9._:-]*[_:.])[a-zA-Z][a-zA-Z0-9._:-]*)$/;
const ref = safeText("provider output reference").max(200).superRefine((value, ctx) => {
  if (!canonicalReferencePattern.test(value)) {
    ctx.addIssue({ code: "custom", message: "provider output reference must be a canonical identifier or sha256 hash" });
  }
});
const hash = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const normalizedDate = safeText("timeline date").regex(/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/);

const prrNegotiationReviewOutputSchema = z.object({
  draftSummary: shortSafeText("PRR negotiation draft summary"),
  requestFollowUpApproval: z.boolean(),
  citedRuleRefs: z.array(ref).max(12),
  deadlineNotes: z.array(shortSafeText("PRR negotiation deadline note")).max(24),
  feeOrStallingSignals: z.array(shortSafeText("PRR negotiation fee or stalling signal")).max(24),
  unresolvedQuestions: z.array(shortSafeText("PRR negotiation unresolved question")).max(24)
}).strict();

const evidenceTriageClassifyOutputSchema = z.object({
  dossierSummary: shortSafeText("evidence triage dossier summary"),
  safeSummaries: z.array(shortSafeText("evidence triage safe summary")).max(24),
  governanceFlags: z.array(z.object({
    evidenceId: id("ev_"), tag: shortSafeText("governance flag tag"), confidence: z.number().min(0).max(1), rationale: shortSafeText("governance flag rationale")
  }).strict()).max(24),
  duplicateGroups: z.array(z.object({
    groupId: id("dup_"), evidenceIds: z.array(id("ev_")).min(1).max(24), rationale: shortSafeText("duplicate group rationale")
  }).strict()).max(24),
  evidenceGaps: z.array(shortSafeText("evidence gap")).max(24),
  assertionCandidates: z.array(z.object({
    candidateId: id("cand_"), evidenceId: id("ev_"), predicate: shortSafeText("assertion candidate predicate"), confidence: z.number().min(0).max(1), rationale: shortSafeText("assertion candidate rationale")
  }).strict()).max(24),
  requestProviderParseApproval: z.boolean(), requestGovernanceReview: z.boolean(), requestQuarantineReview: z.boolean(), requestAssertionProposalReview: z.boolean()
}).strict();

const timelineBuilderSourcedTimelineOutputSchema = z.object({
  timelineItems: z.array(z.object({
    itemId: id("timeline_"), date: normalizedDate.optional(), dateRange: z.object({ start: normalizedDate, end: normalizedDate }).strict().optional(),
    precision: z.enum(["year", "month", "day", "range", "unknown"]), evidenceRefs: z.array(ref).max(24), assertionRefs: z.array(ref).max(24), prrEventRefs: z.array(ref).max(24),
    contentHashRefs: z.array(hash).min(1).max(24), summary: shortSafeText("timeline item summary"),
    uncertaintyCategories: z.array(z.enum(["date-uncertain", "source-conflict", "incomplete-source", "inference-required"])).max(8),
    uncertaintyNotes: z.array(shortSafeText("timeline uncertainty note")).max(12),
    uncertaintySourceRefs: z.array(ref).max(24)
  }).strict().superRefine((value, ctx) => {
    if (value.date === undefined && value.dateRange === undefined) ctx.addIssue({ code: "custom", message: "timeline item requires a date or date range" });
    if (value.evidenceRefs.length + value.assertionRefs.length + value.prrEventRefs.length === 0) ctx.addIssue({ code: "custom", message: "timeline item requires at least one source ref" });
    if (value.uncertaintyCategories.length > 0 && (value.uncertaintyNotes.length === 0 || value.uncertaintySourceRefs.length === 0)) {
      ctx.addIssue({ code: "custom", message: "timeline uncertainty requires notes and exact source refs" });
    }
  })).max(100),
  omissionReasons: z.array(shortSafeText("timeline omission reason")).max(24),
  omittedSources: z.array(z.object({ sourceRef: ref, reason: shortSafeText("timeline omitted-source reason") }).strict()).max(24),
  unresolvedPrompts: z.array(shortSafeText("timeline unresolved prompt")).max(24)
}).strict();

const contradictionFinderCandidatesOutputSchema = z.object({
  candidates: z.array(z.object({
    candidateId: id("contradiction_"), comparedSourceRefs: z.array(ref).min(2).max(24), evidenceIds: z.array(id("ev_")).max(24), evidenceContentHashes: z.array(hash).max(24), assertionIds: z.array(ref).max(24), timelineItemIds: z.array(id("timeline_")).max(24),
    prrEventRefs: z.array(ref).max(24), category: z.enum(["direct-conflict", "timeline-conflict", "attribution-conflict", "quantitative-conflict", "scope-conflict"]),
    confidence: z.number().min(0).max(1), confidenceCaveat: shortSafeText("contradiction confidence caveat"), rationale: shortSafeText("contradiction rationale"),
    uncertaintyRefs: z.array(ref).max(24), alternativeExplanations: z.array(shortSafeText("alternative explanation")).min(1).max(12),
    requestedFollowupEvidence: z.array(shortSafeText("requested follow-up evidence")).min(1).max(24),
    requiredReviewerAction: z.enum(["review", "request-evidence", "request-claim-link-review"])
  }).strict().superRefine((value, ctx) => {
    if (new Set(value.comparedSourceRefs).size < 2) {
      ctx.addIssue({ code: "custom", message: "contradiction candidate requires two distinct exact source refs" });
    }
  })).max(48)
}).strict();

const investigationPlannerNextStepsOutputSchema = z.object({
  planSummary: shortSafeText("investigation plan summary"), objectiveRefs: z.array(ref).max(24), gapIds: z.array(ref).max(24),
  taskCandidates: z.array(z.object({ taskId: id("task_"), summary: shortSafeText("task candidate summary"), priorityRationale: shortSafeText("task candidate priority rationale"), linkedRefs: z.array(ref).max(24), approvalRequirements: z.array(z.enum(["human-review", "external-message-send", "provider-byte-transfer", "legal-escalation", "export-or-publication"])).max(8) }).strict()).max(24),
  prrDraftCandidates: z.array(shortSafeText("PRR draft candidate")).max(12)
}).strict();

const reportBuilderPacketDraftOutputSchema = z.object({
  reportPacketId: id("packet_"), outlineRefs: z.array(ref).max(24), draftSectionRefs: z.array(ref).max(48), citationMapRefs: z.array(ref).max(24), includedEvidenceIds: z.array(id("ev_")).max(200), excludedEvidenceIds: z.array(id("ev_")).max(200),
  governancePolicyRefs: z.array(ref).max(24), sensitiveOptInRequirements: z.array(shortSafeText("sensitive opt-in requirement")).max(24), legalReviewFlags: z.array(shortSafeText("legal review flag")).max(24), exportPublicationApprovalRefs: z.array(ref).max(24), packetSummary: shortSafeText("report packet summary")
}).strict();

export type PrrNegotiationReviewOutput = z.infer<typeof prrNegotiationReviewOutputSchema>;
export type EvidenceTriageClassifyOutput = z.infer<typeof evidenceTriageClassifyOutputSchema>;
export type TimelineBuilderSourcedTimelineOutput = z.infer<typeof timelineBuilderSourcedTimelineOutputSchema>;
export type ContradictionFinderCandidatesOutput = z.infer<typeof contradictionFinderCandidatesOutputSchema>;
export type InvestigationPlannerNextStepsOutput = z.infer<typeof investigationPlannerNextStepsOutputSchema>;
export type ReportBuilderPacketDraftOutput = z.infer<typeof reportBuilderPacketDraftOutputSchema>;

export type ProductionSpecialistProviderOutput =
  | { readonly runType: "prr-negotiation"; readonly value: PrrNegotiationReviewOutput }
  | { readonly runType: "evidence-triage"; readonly value: EvidenceTriageClassifyOutput }
  | { readonly runType: "timeline-builder"; readonly value: TimelineBuilderSourcedTimelineOutput }
  | { readonly runType: "contradiction-finder"; readonly value: ContradictionFinderCandidatesOutput }
  | { readonly runType: "investigation-planner"; readonly value: InvestigationPlannerNextStepsOutput }
  | { readonly runType: "report-builder"; readonly value: ReportBuilderPacketDraftOutput };

export function validateProductionSpecialistProviderOutput(input: { readonly runType: ProductionRunType; readonly value: unknown }): ProductionSpecialistProviderOutput {
  const envelope = normalizeProviderOutputEnvelope(input);

  switch (envelope.runType) {
    case "prr-negotiation": return deepFreeze({ runType: envelope.runType, value: parseProviderOutput(prrNegotiationReviewOutputSchema, envelope.value) });
    case "evidence-triage": return deepFreeze({ runType: envelope.runType, value: parseProviderOutput(evidenceTriageClassifyOutputSchema, envelope.value) });
    case "timeline-builder": return deepFreeze({ runType: envelope.runType, value: parseProviderOutput(timelineBuilderSourcedTimelineOutputSchema, envelope.value) });
    case "contradiction-finder": return deepFreeze({ runType: envelope.runType, value: parseProviderOutput(contradictionFinderCandidatesOutputSchema, envelope.value) });
    case "investigation-planner": return deepFreeze({ runType: envelope.runType, value: parseProviderOutput(investigationPlannerNextStepsOutputSchema, envelope.value) });
    case "report-builder": return deepFreeze({ runType: envelope.runType, value: parseProviderOutput(reportBuilderPacketDraftOutputSchema, envelope.value) });
    default: throw new Error("Unsupported production specialist run type.");
  }
}

function parseProviderOutput<T>(schema: z.ZodType<T>, value: unknown): T {
  return schema.parse(value);
}

function normalizeProviderOutputEnvelope(input: unknown): { readonly runType: unknown; readonly value: unknown } {
  const normalized = normalizeProviderOutputJsonValue(input, "$", new WeakSet<object>());
  if (normalized === null || Array.isArray(normalized) || typeof normalized !== "object") {
    throw new Error("$ must be JSON DTO-safe.");
  }

  const envelope = normalized as Record<string, unknown>;
  if (Object.keys(envelope).length !== 2 || !("runType" in envelope) || !("value" in envelope)) {
    throw new Error("$ must be JSON DTO-safe.");
  }

  return { runType: envelope.runType, value: envelope.value };
}

function normalizeProviderOutputJsonValue(value: unknown, path: string, seen: WeakSet<object>): unknown {
  if (value === null) {
    return null;
  }

  switch (typeof value) {
    case "string":
    case "boolean":
      return value;
    case "number":
      if (!Number.isFinite(value)) {
        throw new Error(`${path} must be JSON DTO-safe.`);
      }
      return value;
    case "object":
      return Array.isArray(value)
        ? normalizeProviderOutputJsonArray(value, path, seen)
        : normalizeProviderOutputJsonObject(value, path, seen);
    default:
      throw new Error(`${path} must be JSON DTO-safe.`);
  }
}

function normalizeProviderOutputJsonArray(value: readonly unknown[], path: string, seen: WeakSet<object>): unknown[] {
  if (Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertySymbols(value).length > 0) {
    throw new Error(`${path} must be JSON DTO-safe.`);
  }
  if (seen.has(value)) {
    throw new Error(`${path} must be JSON DTO-safe.`);
  }

  seen.add(value);
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
    const lengthDescriptor = descriptors.length;
    const length = lengthDescriptor !== undefined && "value" in lengthDescriptor
      ? lengthDescriptor.value
      : undefined;
    if (typeof length !== "number" || !Number.isSafeInteger(length) || length < 0) {
      throw new Error(`${path} must be JSON DTO-safe.`);
    }

    const items: unknown[] = new Array(length);
    let itemCount = 0;
    for (const key of Object.keys(descriptors)) {
      if (key === "length") {
        continue;
      }
      if (!isCanonicalArrayIndexKey(key)) {
        throw new Error(`${path} must be JSON DTO-safe.`);
      }

      const descriptor = descriptors[key];
      const index = Number(key);
      if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor) || index >= length) {
        throw new Error(`${path} must be JSON DTO-safe.`);
      }
      items[index] = normalizeProviderOutputJsonValue(descriptor.value, `${path}[${index}]`, seen);
      itemCount += 1;
    }
    if (itemCount !== length) {
      throw new Error(`${path} must be JSON DTO-safe.`);
    }

    return items;
  } finally {
    seen.delete(value);
  }
}

function normalizeProviderOutputJsonObject(value: object, path: string, seen: WeakSet<object>): Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value);
  if ((prototype !== Object.prototype && prototype !== null) || Object.getOwnPropertySymbols(value).length > 0) {
    throw new Error(`${path} must be JSON DTO-safe.`);
  }
  if (seen.has(value)) {
    throw new Error(`${path} must be JSON DTO-safe.`);
  }

  seen.add(value);
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const normalized = Object.create(null) as Record<string, unknown>;
    for (const key of Object.keys(descriptors)) {
      const descriptor = descriptors[key];
      if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
        throw new Error(`${path} must be JSON DTO-safe.`);
      }
      normalized[key] = normalizeProviderOutputJsonValue(descriptor.value, `${path}.${key}`, seen);
    }
    return normalized;
  } finally {
    seen.delete(value);
  }
}

function isCanonicalArrayIndexKey(key: string): boolean {
  if (!/^(0|[1-9][0-9]*)$/.test(key)) {
    return false;
  }
  const index = Number(key);
  return Number.isSafeInteger(index) && index < 2 ** 32 - 1;
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object" || seen.has(value)) {
    return value;
  }

  seen.add(value);
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
    if ("value" in descriptor) {
      deepFreeze(descriptor.value, seen);
    }
  }
  return Object.freeze(value);
}
