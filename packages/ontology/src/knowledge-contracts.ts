import { z } from "zod";
import { boundedEvidenceReferenceSchema, pdfCoverageSchema } from "./extraction-contracts.js";

const id = z.string().min(1).max(200);
const text = z.string().min(1).max(10000);
import { partialDateSchema as partialDate, dateNormalizationSchema, knowledgeTimeSchema, isGroundedDate } from "./knowledge-dates.js";
export { knowledgeTimeSchema } from "./knowledge-dates.js";
export const knowledgeValueSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("string"), value: text }).strict(),
  z.object({ type: z.literal("number"), value: z.number().finite(), unit: id.optional() }).strict(),
  z.object({ type: z.literal("boolean"), value: z.boolean() }).strict(),
  z.object({ type: z.literal("date"), value: partialDate, normalization: dateNormalizationSchema.optional() }).strict(),
  z.object({ type: z.literal("entity"), mentionId: id }).strict()
]);
export const knowledgeCitationSchema = boundedEvidenceReferenceSchema.extend({ quote: text, passageIndex: z.number().int().nonnegative(), pdfCoverage: z.union([pdfCoverageSchema, z.object({ status: z.literal("unknown") }).strict()]).optional() }).strict();
export const knowledgeProposalSchema = z.object({
  assertionId: z.string().regex(/^as_[a-zA-Z0-9_-]+$/), workspaceId: id,
  kind: z.enum(["entity", "fact", "relationship", "occurrence"]), predicate: id, value: knowledgeValueSchema,
  subjectMentionId: id.optional(), mentionId: id.optional(), entityType: id.optional(),
  occurrenceId: id.optional(), participants: z.array(z.object({ role: id, mentionId: id }).strict()).max(20).optional(),
  attributes: z.array(z.object({ predicate: id, value: knowledgeValueSchema }).strict()).max(20).optional(),
  occurredTime: knowledgeTimeSchema.optional(), publicationTime: knowledgeTimeSchema.optional(),
  evidence: z.array(knowledgeCitationSchema).min(1).max(24),
  schemaId: id, modelScore: z.number().min(0).max(1).optional(),
  provenance: z.object({ kind: z.enum(["manual", "provider"]), invocationId: id.optional(), outputHash: id.optional(), provider: id.optional(), model: id.optional(), promptVersion: id.optional() }).strict(),
  derivedFrom: id.optional()
}).strict();
export type KnowledgeProposal = z.infer<typeof knowledgeProposalSchema>;
export type KnowledgeCitation = z.infer<typeof knowledgeCitationSchema>;
export type KnowledgeValue = z.infer<typeof knowledgeValueSchema>;
export const predicateDefinitionSchema = z.object({ name: id, kind: z.enum(["entity", "fact", "relationship", "occurrence"]), valueType: z.enum(["string", "number", "boolean", "date", "entity"]), fromTypes: z.array(id), toTypes: z.array(id) }).strict();
export const vocabularySchema = z.object({
  schemaId: id, entityTypes: z.array(id).min(1).max(30),
  predicates: z.array(predicateDefinitionSchema).min(1).max(100)
}).strict();
const vocabularyTerm = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/);
export const vocabularyAdditionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("entityType"), name: vocabularyTerm }).strict(),
  z.object({ kind: z.literal("predicate"), definition: predicateDefinitionSchema.extend({ name: vocabularyTerm, fromTypes: z.array(vocabularyTerm).max(30), toTypes: z.array(vocabularyTerm).max(30) }) }).strict()
]);
export type VocabularyAddition = z.infer<typeof vocabularyAdditionSchema>;
export type KnowledgeVocabulary = z.infer<typeof vocabularySchema>;
const baseEntityTypes = ["person", "organization", "agency"];
export const investigationVocabulary: z.infer<typeof vocabularySchema> = {
  schemaId: "investigation.v1", entityTypes: [...baseEntityTypes, "contract", "address"],
  predicates: [
    { name: "name", kind: "entity", valueType: "string", fromTypes: [], toTypes: [] },
    ...["identifier", "address", "description"].map(name => ({ name, kind: "fact" as const, valueType: "string" as const, fromTypes: [], toTypes: [] })),
    { name: "amount", kind: "fact", valueType: "number", fromTypes: [], toTypes: [] },
    { name: "date", kind: "fact", valueType: "date", fromTypes: [], toTypes: [] },
    ...["paid", "awarded", "employed_by", "owns", "associated_with"].map(name => ({ name, kind: "relationship" as const, valueType: "entity" as const, fromTypes: baseEntityTypes, toTypes: [...baseEntityTypes, "contract", "address"] })),
    ...["payment", "award", "appointment", "meeting", "ownership_change"].map(name => ({ name, kind: "occurrence" as const, valueType: "string" as const, fromTypes: [], toTypes: [] }))
  ]
};
export const knowledgePayloadSchemas = {
  "investigation.created": z.object({ caseId: id, title: text, question: text, scope: text, notes: z.string().max(10000) }).strict(),
  "investigation.selected": z.object({ caseId: id.nullable() }).strict(),
  "investigation.membership.changed": z.object({ caseId: id, targetKind: z.enum(["evidence", "knowledge", "entity"]), targetId: id, included: z.boolean() }).strict(),
  "investigation.hypothesis.recorded": z.object({ caseId: id, hypothesisId: id, statement: text, supporting: z.array(id).max(100), contradicting: z.array(id).max(100) }).strict(),
  "knowledge.schema.recorded": vocabularySchema,
  "knowledge.schema.extended": z.object({ baseSchemaId: id, schemaId: id, addition: vocabularyAdditionSchema, rationale: text, decisionId: id }).strict(),
  "knowledge.proposed": knowledgeProposalSchema,
  "knowledge.reviewed": z.object({ assertionId: id, proposalEventId: id, action: z.enum(["accept", "reject", "withdraw", "supersede", "dispute"]), rationale: text, replacementId: id.optional(), decisionId: id }).strict(),
  "knowledge.mention.bound": z.object({ mentionId: id, entityId: z.string().regex(/^ent_[a-zA-Z0-9_-]+$/), entityType: id, label: text, assertionId: id, previousEntityId: id.nullable(), rationale: text, decisionId: id }).strict(),
  "knowledge.source.lineage": z.object({ evidenceId: id, originId: id, independence: z.enum(["independent", "derived", "unknown"]), rationale: text }).strict()
} as const;
export type KnowledgeV2Type = keyof typeof knowledgePayloadSchemas;

/** Literal grounding shared by manual commands and external proposal validation. */
export function isKnowledgeValueGrounded(value: Exclude<KnowledgeValue, { type: "entity" }>, quote: string): boolean {
  if (value.type === "date") return isGroundedDate(value.value, quote, value.normalization);
  if (value.type === "number") {
    const numbers = quote.match(/[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g) ?? [];
    return numbers.some(number => Number(number.replaceAll(",", "")) === value.value)
      && (!value.unit || quote.includes(value.unit));
  }
  const literal = String(value.value);
  return value.type === "boolean" ? new RegExp(`\\b${literal}\\b`, "i").test(quote) : quote.includes(literal);
}
