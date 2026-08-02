import { z } from "zod";
import type {
  EvidenceWorkspaceDto,
  PrepareEvidenceAssertionCandidateInput,
  PrepareEvidenceAssertionCandidateResult
} from "./evidence-types.js";

const safeTextSchema = z.string().min(1).refine(
  (value) => !/api[_ -]?key|authorization|bearer|password|secret|oauth|credential|cookie\s*:|session\s*=/i.test(value),
  { message: "text must not contain credential-shaped material" }
);
const evidenceIdSchema = z.string().regex(/^ev_[a-zA-Z0-9_-]+$/);
const assertionIdSchema = z.string().regex(/^as_[a-zA-Z0-9_-]+$/);
const eventIdSchema = z.string().regex(/^evt_[a-zA-Z0-9_-]+$/);
const contentHashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const adapterRefSchema = z.object({ name: z.string().min(1), version: z.string().min(1) }).strict();
const occurrenceSchema = z.object({
  occurrenceId: z.string().regex(/^occ_[a-zA-Z0-9_-]+$/),
  sourceCollectionId: z.string().regex(/^src_[a-zA-Z0-9_-]+$/),
  scanBatchId: z.string().regex(/^scan_[a-zA-Z0-9_-]+$/),
  sourcePath: z.string().min(1),
  contentHash: contentHashSchema,
  sizeBytes: z.number().int().nonnegative(),
  status: z.enum(["new", "duplicate", "changed", "missing", "skipped"]),
  adapter: adapterRefSchema.optional(),
  archive: z.object({
    containerPath: z.string().min(1),
    containerHash: contentHashSchema,
    internalPath: z.string().min(1),
    adapter: adapterRefSchema
  }).strict().optional()
}).strict();
const parseJobSchema = z.object({
  parseJobId: z.string().regex(/^parse_[a-zA-Z0-9_-]+$/),
  sourceCollectionId: z.string().regex(/^src_[a-zA-Z0-9_-]+$/),
  importBatchId: z.string().regex(/^imp_[a-zA-Z0-9_-]+$/),
  lane: z.enum(["local", "provider"]),
  parser: adapterRefSchema,
  state: z.enum(["queued", "running", "succeeded", "failed"]),
  derivative: z.object({ contentHash: contentHashSchema, mediaType: z.string().min(1) }).strict().optional()
}).strict();
const governanceTagSchema = z.object({
  tag: z.string().min(1),
  confidence: z.number().min(0).max(1),
  rationale: safeTextSchema,
  source: z.enum(["ai", "human"]),
  status: z.enum(["active", "removed"]),
  eventId: eventIdSchema
}).strict();
const linkedReferenceSchema = z.object({
  kind: z.enum(["prr", "investigation"]),
  id: z.string().min(1),
  eventIds: z.array(eventIdSchema)
}).strict();
const evidenceReferenceSchema = z.object({
  evidenceId: evidenceIdSchema,
  contentHash: contentHashSchema,
  eventIds: z.array(eventIdSchema)
}).strict();
const assertionCandidateSchema = z.object({
  assertionId: assertionIdSchema,
  evidenceReferences: z.array(evidenceReferenceSchema).min(1),
  predicate: z.string().min(1),
  confidence: z.number().min(0).max(1),
  reviewState: z.literal("proposed"),
  reviewRequired: z.literal(true),
  eventId: eventIdSchema
}).strict();
const evidenceItemSchema = z.object({
  evidenceId: evidenceIdSchema,
  contentHash: contentHashSchema.optional(),
  mediaType: z.string().min(1).optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  source: z.object({ kind: z.string().min(1), label: z.string().min(1) }).strict().optional(),
  sourceCollections: z.array(z.object({
    sourceCollectionId: z.string().regex(/^src_[a-zA-Z0-9_-]+$/),
    label: z.string().min(1)
  }).strict()),
  importBatchIds: z.array(z.string().regex(/^imp_[a-zA-Z0-9_-]+$/)),
  occurrences: z.array(occurrenceSchema),
  parseJobs: z.array(parseJobSchema),
  governanceTags: z.array(governanceTagSchema),
  quarantined: z.boolean(),
  tombstoned: z.boolean(),
  linkedReferences: z.array(linkedReferenceSchema),
  provenanceComplete: z.boolean(),
  selectableForAssertionCandidate: z.boolean(),
  blockingReasons: z.array(safeTextSchema)
}).strict();
const diagnosticSchema = z.object({
  code: z.enum(["projection-error", "missing-provenance"]),
  severity: z.enum(["warning", "error"]),
  message: safeTextSchema,
  repairActions: z.array(safeTextSchema).min(1)
}).strict();
const evidenceWorkspaceSchema = z.object({
  schemaVersion: z.literal("evidence-workspace.v1"),
  status: z.enum(["ready", "degraded"]),
  sourceHighWaterMark: z.number().int().nonnegative(),
  items: z.array(evidenceItemSchema),
  assertionCandidates: z.array(assertionCandidateSchema),
  diagnostics: z.array(diagnosticSchema)
}).strict();
const preparationResultSchema = z.object({
  ok: z.literal(true),
  candidate: assertionCandidateSchema,
  workspace: evidenceWorkspaceSchema
}).strict();
const actionDiagnosticSchema = z.object({
  ok: z.literal(false),
  diagnostic: z.object({
    code: z.enum(["EVIDENCE_ASSERTION_INPUT_INVALID", "EVIDENCE_ASSERTION_PREPARATION_BLOCKED"]),
    message: safeTextSchema,
    repairActions: z.array(safeTextSchema).min(1)
  }).strict()
}).strict();

export interface EvidenceWorkspaceAdapter {
  loadWorkspace(): Promise<EvidenceWorkspaceDto>;
  prepareAssertionCandidate(
    input: PrepareEvidenceAssertionCandidateInput
  ): Promise<PrepareEvidenceAssertionCandidateResult>;
}

export function evidenceWorkspaceDtoFromJson(value: unknown): EvidenceWorkspaceDto {
  return deepFreeze(evidenceWorkspaceSchema.parse(value) as EvidenceWorkspaceDto);
}

export function createHttpEvidenceWorkspaceAdapter(
  input: { readonly fetcher?: typeof fetch } = {}
): EvidenceWorkspaceAdapter {
  const fetcher = input.fetcher ?? fetch;
  return Object.freeze({
    async loadWorkspace() {
      const response = await fetcher("/api/evidence/workspace", {
        method: "GET",
        headers: { accept: "application/json" }
      });
      const value: unknown = await response.json();
      const parsed = evidenceWorkspaceSchema.safeParse(value);
      if (!parsed.success) {
        throw new Error("Evidence workspace could not be loaded safely.");
      }
      return deepFreeze(parsed.data as EvidenceWorkspaceDto);
    },
    async prepareAssertionCandidate(candidateInput: PrepareEvidenceAssertionCandidateInput) {
      const response = await fetcher("/api/evidence/assertion-candidates", {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify(candidateInput)
      });
      const value: unknown = await response.json();
      if (!response.ok) {
        const failed = actionDiagnosticSchema.safeParse(value);
        throw new Error(failed.success
          ? failed.data.diagnostic.message
          : "Evidence assertion preparation was blocked safely.");
      }
      const parsed = preparationResultSchema.parse(value);
      return deepFreeze({
        candidate: parsed.candidate,
        workspace: parsed.workspace
      } as unknown as PrepareEvidenceAssertionCandidateResult);
    }
  });
}

export const httpEvidenceWorkspaceAdapter = createHttpEvidenceWorkspaceAdapter();

export function createStaticEvidenceWorkspaceAdapter(
  workspace: EvidenceWorkspaceDto
): EvidenceWorkspaceAdapter {
  const snapshot = evidenceWorkspaceDtoFromJson(structuredClone(workspace));
  return Object.freeze({
    async loadWorkspace() {
      return deepFreeze(structuredClone(snapshot));
    },
    async prepareAssertionCandidate() {
      throw new Error("Static evidence workspace does not record assertion candidates.");
    }
  });
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}
