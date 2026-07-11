import { z } from "zod";
import { assertAgentSecretSafeText } from "./secret-safety.js";
import type { AgentSpecialistRunType } from "./specialists.js";

type ProductionRunType = Exclude<AgentSpecialistRunType, "ontology-bootstrap">;

const normalizeAuthorityClaimText = (value: string) => value
  .replace(/[^a-zA-Z0-9,;.!?]+/g, " ")
  .replace(/\s+/g, " ")
  .trim()
  .toLowerCase();

const hasSubjectAction = (value: string, subject: RegExp, action: RegExp) => subject.test(value) && action.test(value);
const hasCompletedEffect = (value: string, subject: RegExp, action: RegExp) =>
  hasSubjectAction(value, subject, action) || hasSubjectAction(value, subject, /\bcompleted\b/);

const hasInstructionBeforeAction = (value: string, instructionModal: RegExp, action: RegExp) => {
  const instructionMatch = instructionModal.exec(value);
  const actionMatch = action.exec(value);

  return instructionMatch !== null && actionMatch !== null && instructionMatch.index < actionMatch.index;
};

const hasCompletedPrrEffect = (value: string) => {
  const subject = /\b(?:prr|public records request|request|response)\b/;
  const action = /\b(?:sent|emailed|mailed|faxed|filed|submitted|delivered|transferred|uploaded|published)\b/;
  const completed = /\bcompleted\b/;
  const instructionModal = /\b(?:should|must|may|might|can|could|would|will)\b/;

  return value.split(/[,;.!?]+/).some((clause) =>
    (hasSubjectAction(clause, subject, completed) && !hasInstructionBeforeAction(clause, instructionModal, completed)) ||
    (hasSubjectAction(clause, subject, action) && !hasInstructionBeforeAction(clause, instructionModal, action))
  );
};

const hasAuthorityClaim = (value: string) => {
  const normalized = normalizeAuthorityClaimText(value);

  return (
    hasCompletedPrrEffect(normalized) ||
    hasCompletedEffect(normalized, /\b(?:legal escalation|escalation)\b/, /\b(?:performed|executed|sent|filed|escalated|approved)\b/) ||
    hasSubjectAction(normalized, /\bprovider byte transfer\b/, /\b(?:approval|approv(?:e|ed)|grant(?:ed)?|complet(?:ed|ion)|authori[sz](?:e|ed|ation))\b/) ||
    hasCompletedEffect(normalized, /\b(?:report|packet|publication|export|evidence)\b/, /\b(?:exported|published)\b/) ||
    hasCompletedEffect(normalized, /\b(?:repair|remediation)\b/, /\b(?:performed|executed)\b/) ||
    hasCompletedEffect(normalized, /\b(?:graph|ontology|assertion|relationship)\b/, /\baccepted\b/) ||
    hasCompletedEffect(normalized, /\b(?:entity|entities|relationship)\b/, /\b(?:resolved|accepted)\b/) ||
    hasCompletedEffect(normalized, /\b(?:legal|export|governance )?lock\b/, /\bcleared\b/)
  );
};
const hasRawProviderError = (value: string) =>
  (/\b(?:provider|model|api|openai|nous)\b/i.test(value) &&
    /\b(?:diagnostic|failure|failed|error|exception|stack|timeout|timed out|rate[ -]?limit(?:ed)?|status|https?|response(?:[ -]?body)?)\b/i.test(value)) ||
  /\b[a-z][a-z0-9_-]{2,}\s+(?:diagnostic|failure|failed|error|exception|timeout|timed out)\s*:/i.test(value) ||
  /\b(?:error|errors|exception|failure|failures|failed|timeout|timeouts|timed out)\b/i.test(value) ||
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
    summary: shortSafeText("timeline item summary"), uncertaintyCategories: z.array(z.enum(["date-uncertain", "source-conflict", "incomplete-source", "inference-required"])).max(8)
  }).strict().superRefine((value, ctx) => {
    if (value.date === undefined && value.dateRange === undefined) ctx.addIssue({ code: "custom", message: "timeline item requires a date or date range" });
    if (value.evidenceRefs.length + value.assertionRefs.length + value.prrEventRefs.length === 0) ctx.addIssue({ code: "custom", message: "timeline item requires at least one source ref" });
  })).max(100),
  omissionReasons: z.array(shortSafeText("timeline omission reason")).max(24), unresolvedPrompts: z.array(shortSafeText("timeline unresolved prompt")).max(24)
}).strict();

const contradictionFinderCandidatesOutputSchema = z.object({
  candidates: z.array(z.object({
    candidateId: id("contradiction_"), comparedSourceRefs: z.array(ref).min(2).max(24), evidenceIds: z.array(id("ev_")).max(24), evidenceContentHashes: z.array(hash).max(24), assertionIds: z.array(ref).max(24), timelineItemIds: z.array(id("timeline_")).max(24),
    category: z.enum(["direct-conflict", "timeline-conflict", "attribution-conflict", "quantitative-conflict", "scope-conflict"]), confidence: z.number().min(0).max(1), rationale: shortSafeText("contradiction rationale"),
    alternativeExplanations: z.array(shortSafeText("alternative explanation")).max(12), requiredReviewerAction: z.enum(["review", "request-evidence", "request-claim-link-review"])
  }).strict()).max(48)
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
  switch (input.runType) {
    case "prr-negotiation": return Object.freeze({ runType: input.runType, value: prrNegotiationReviewOutputSchema.parse(input.value) });
    case "evidence-triage": return Object.freeze({ runType: input.runType, value: evidenceTriageClassifyOutputSchema.parse(input.value) });
    case "timeline-builder": return Object.freeze({ runType: input.runType, value: timelineBuilderSourcedTimelineOutputSchema.parse(input.value) });
    case "contradiction-finder": return Object.freeze({ runType: input.runType, value: contradictionFinderCandidatesOutputSchema.parse(input.value) });
    case "investigation-planner": return Object.freeze({ runType: input.runType, value: investigationPlannerNextStepsOutputSchema.parse(input.value) });
    case "report-builder": return Object.freeze({ runType: input.runType, value: reportBuilderPacketDraftOutputSchema.parse(input.value) });
  }
}
