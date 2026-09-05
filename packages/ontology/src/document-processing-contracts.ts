import { z } from "zod";
import { knowledgeProposalSchema, vocabularySchema } from "./knowledge-contracts.js";
import type { PdfCoverage } from "./extraction-contracts.js";

const hash = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const invocationId = z.string().regex(/^inv_[a-zA-Z0-9_-]+$/);
export const documentSelectionSchema = z.object({
  evidenceId: z.string().regex(/^ev_[a-zA-Z0-9_-]+$/),
  extractionId: z.string().min(1).max(200),
  passageIndexes: z.array(z.number().int().nonnegative()).min(1).max(24)
    .refine((values) => new Set(values).size === values.length, "Passage indexes must be unique")
}).strict();
export type DocumentSelection = z.infer<typeof documentSelectionSchema>;
export const documentProcessingStateSchema = z.enum([
  "awaiting_approval", "queued", "running", "completed", "failed", "canceled", "uncertain"
]);
export type DocumentProcessingState = z.infer<typeof documentProcessingStateSchema>;
export const documentProcessingPreviewedSchema = z.object({
  invocationId,
  selection: documentSelectionSchema,
  manifestHash: hash,
  retryOf: invocationId.optional()
}).strict();
export const documentProcessingApprovedSchema = z.object({
  invocationId,
  manifestHash: hash,
  approvedBy: z.string().min(3)
}).strict();
export const documentProcessingStateChangedSchema = z.object({
  invocationId,
  state: documentProcessingStateSchema.exclude(["awaiting_approval", "queued"]),
  reason: z.enum([
    "submission-started", "validated-output", "selection-or-authority-changed", "provider-rejected",
    "invalid-output", "limit-exceeded", "submission-uncertain", "interrupted", "human-canceled"
  ]),
  outputHash: hash.optional(),
  usage: z.object({ inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative() }).strict().optional()
}).strict().superRefine((value, ctx) => {
  if ((value.state === "completed") !== (value.outputHash !== undefined)) {
    ctx.addIssue({ code: "custom", message: "Only completed invocations carry validated output" });
  }
});

export const documentSummaryOutputSchema = z.object({
  summary: z.string().min(1).max(12000),
  citations: z.array(z.object({ passageIndex: z.number().int().nonnegative(), quote: z.string().min(1).max(3000) }).strict()).min(1).max(24)
}).strict();

/** Provider-local fields only; authority, IDs and evidence references are resolved by the server. */
export const providerKnowledgeProposalSchema = knowledgeProposalSchema.omit({
  assertionId: true, workspaceId: true, evidence: true, schemaId: true, provenance: true, derivedFrom: true
}).extend({ citations: documentSummaryOutputSchema.shape.citations }).strict();
export const knowledgeExtractionOutputSchema = z.object({
  proposals: z.array(providerKnowledgeProposalSchema).max(40)
}).strict();
export type KnowledgeExtractionOutput = z.infer<typeof knowledgeExtractionOutputSchema>;
export type DocumentProcessingOperation = "document-summary.v1" | "knowledge-extraction.v1";

export interface ResolvedDocumentSelection {
  provenanceEventIds?: string[];
  pdfCoverage?: PdfCoverage | { status: "unknown" };
  evidenceId: string;
  extractionId: string;
  sourceHash: string;
  extractionHash: string;
  policyRevision: string;
  classification: "public_safe";
  classificationEventId: string;
  reviewEventId: string;
  passages: { index: number; text: string; locator: unknown }[];
}
export interface ProviderConfiguration {
  endpoint: string;
  model: string;
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
}
export interface DocumentProcessingManifest {
  schemaVersion: "document-processing-manifest.v1";
  invocationId: string;
  actorId: string;
  selection: DocumentSelection;
  resolved: ResolvedDocumentSelection;
  destination: ProviderConfiguration;
  operation: DocumentProcessingOperation;
  workspaceId?: string;
  promptVersion?: "knowledge-extraction-prompt.v1";
  schemaSnapshot?: z.infer<typeof vocabularySchema>;
  provider: "openai-compatible-chat.v1";
  inputText: string;
  systemPrompt: string;
  inputBytes: number;
  inputTokenUpperBound: number;
  maxOutputTokens: number;
  maxResponseBytes: number;
  maximumEstimatedUsd: number;
  budgetUsd: number;
  timeoutMs: number;
  retryOf?: string;
}
export interface DocumentProcessingJob {
  invocationId: string;
  manifestHash: string;
  selection: DocumentSelection;
  state: DocumentProcessingState;
  reason?: string;
  outputHash?: string;
  retryOf?: string;
  createdAt: string;
}
