import { z } from "zod";

const identity = z.string().min(1).max(200);
const hash = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const span = { block: z.number().int().positive(), start: z.number().int().nonnegative(), end: z.number().int().nonnegative() };
export const evidenceLocatorSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), ...span }).strict(),
  z.object({ kind: z.literal("pdf"), page: z.number().int().positive(), ...span }).strict(),
  z.object({ kind: z.literal("csv"), row: z.number().int().positive(), column: z.number().int().positive() }).strict()
]).refine((locator) => locator.kind === "csv" || locator.end >= locator.start, "Span end must not precede its start.");
export const extractionArtifactSchema = z.object({
  schemaVersion: z.literal("evidence-extraction.v1"),
  extractionId: identity,
  evidenceId: z.string().regex(/^ev_[a-zA-Z0-9_-]+$/),
  sourceContentHash: hash,
  extractor: z.object({ name: identity, version: identity, engine: identity.optional(), engineVersion: identity.optional() }).strict(),
  format: z.enum(["text", "csv", "pdf"]),
  text: z.string().max(8_000_000),
  passages: z.array(z.object({ locator: evidenceLocatorSchema, text: z.string().max(8_000_000) }).strict()).max(100_000)
}).strict();
export type ExtractionArtifact = z.infer<typeof extractionArtifactSchema>;
export type EvidenceLocator = z.infer<typeof evidenceLocatorSchema>;
export const extractionMediaType = "application/vnd.cestus.extraction+json";
export const localExtractorIdentity = { name: "cestus-local-extraction", version: "1.0.0" } as const;

/** Workspace-wide references deliberately carry no case-owned identity. */
export const boundedEvidenceReferenceSchema = z.object({
  workspaceId: identity, evidenceId: identity, sourceContentHash: hash,
  extractionId: identity, extractionContentHash: hash, locator: evidenceLocatorSchema,
  provenanceEventIds: z.array(identity).min(1).max(100)
}).strict();
export const evidenceCandidateSchema = z.object({
  candidateId: identity, workspaceId: identity, predicate: identity,
  subjectEntityId: identity.optional(),
  value: z.discriminatedUnion("type", [
    z.object({ type: z.literal("string"), value: z.string().max(10_000) }).strict(),
    z.object({ type: z.literal("number"), value: z.number().finite(), unit: identity.optional() }).strict(),
    z.object({ type: z.literal("boolean"), value: z.boolean() }).strict(),
    z.object({ type: z.literal("entity"), entityId: identity }).strict(),
    z.object({ type: z.literal("date"), value: z.string().date(), precision: z.enum(["day", "month", "year"]) }).strict()
  ]),
  time: z.object({ kind: z.enum(["occurred", "recorded", "valid"]), start: z.string().datetime(), end: z.string().datetime().optional(), uncertain: z.boolean() }).strict().optional(),
  evidence: z.array(boundedEvidenceReferenceSchema).min(1).max(100),
  provenance: z.object({ actorId: identity, operation: identity, invocationId: identity.optional(), provider: identity.optional(), model: identity.optional() }).strict(),
  reviewState: z.enum(["proposed", "accepted", "rejected", "superseded"]),
  reviewEventId: identity.optional()
}).strict().superRefine((candidate, ctx) => {
  if (candidate.time?.end !== undefined && Date.parse(candidate.time.end) < Date.parse(candidate.time.start)) ctx.addIssue({ code: "custom", message: "Time interval end must not precede its start." });
  if (candidate.evidence.some((ref) => ref.workspaceId !== candidate.workspaceId)) ctx.addIssue({ code: "custom", message: "Evidence must belong to the candidate workspace." });
  if (candidate.reviewState !== "proposed" && candidate.reviewEventId === undefined) ctx.addIssue({ code: "custom", message: "A reviewed candidate requires a review event." });
});
