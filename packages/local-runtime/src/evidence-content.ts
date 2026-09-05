import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { extractionArtifactSchema, extractionMediaType, type ExtractionArtifact } from "../../ontology/src/extraction-contracts.js";
import type { MountedWorkspace } from "../../ingestion/src/mount-contract.js";
import { buildEvidenceWorkspaceDto, type EvidenceItemDto } from "../../ingestion/src/read-api.js";
import type { ActorRef, KnowledgeEvent } from "../../ontology/src/contracts.js";
import { containsCredentialShapedEvidenceText, evaluateEvidenceProposalEligibility } from "../../ontology/src/evidence-service.js";
import { buildGovernanceProjection } from "../../ontology/src/governance-projection.js";
import { activeGovernancePolicyRef } from "../../ontology/src/governance-read-model.js";
import { restrictedExportTags } from "../../ontology/src/governance-policy.js";

export class EvidenceContentError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
type Hash = `sha256:${string}`;
const hash = (value: string) => `sha256:${createHash("sha256").update(value).digest("hex")}` as Hash;

export function authorizeEvidence(events: readonly KnowledgeEvent[], evidenceId: string, actor: ActorRef): EvidenceItemDto {
  if (actor.kind !== "human" || !/^ev_[A-Za-z0-9_-]+$/.test(evidenceId)) throw new EvidenceContentError(403, "Evidence access is not authorized.");
  const eligibility = evaluateEvidenceProposalEligibility(events, evidenceId);
  const governance = buildGovernanceProjection(events).evidenceGovernance.get(evidenceId);
  const redacted = events.some(event => event.type === "evidence.redaction.applied" && event.payload.evidenceId === evidenceId);
  if (!eligibility.selectable || governance?.currentTags.get("credential_risk")?.status === "active" || redacted) {
    throw new EvidenceContentError(403, "Content is unavailable under current provenance or governance. Review the evidence; redacted views require a supported safe derivative.");
  }
  const item = buildEvidenceWorkspaceDto(events).items.find(item => item.evidenceId === evidenceId);
  if (!item?.contentHash) throw new EvidenceContentError(403, "Evidence access is not authorized.");
  return item;
}

export async function readEvidenceContent(workspace: MountedWorkspace, actor: ActorRef, evidenceId: string, extractionId?: string) {
  const events = await workspace.ledger.readAll();
  const item = authorizeEvidence(events, evidenceId, actor);
  // Validate canonical original before returning any derivative or snippet.
  await workspace.blobStore.get(item.contentHash as Hash);
  const completed = events.filter(event => event.type === "ingestion.parse.completed" && event.payload.evidenceId === evidenceId);
  const selected = extractionId === undefined ? completed.at(-1) : completed.find(event => event.type === "ingestion.parse.completed" && event.payload.parseJobId === extractionId);
  if (extractionId !== undefined && !selected) throw new EvidenceContentError(404, "This extraction does not belong to the selected evidence.");
  let extraction: ExtractionArtifact | undefined;
  let extractionHash: Hash | undefined;
  if (selected?.type === "ingestion.parse.completed") {
    if (selected.payload.outputMediaType !== extractionMediaType) throw new EvidenceContentError(409, "This legacy derivative has no precise source locations. Run a supported extraction.");
    const bytes = await workspace.derivativeStore.get(selected.payload.outputHash as Hash);
    extraction = extractionArtifactSchema.parse(JSON.parse(bytes.toString("utf8")));
    if (extraction.evidenceId !== evidenceId || extraction.sourceContentHash !== item.contentHash || extraction.extractionId !== selected.payload.parseJobId) throw new EvidenceContentError(409, "Extraction provenance does not match the original.");
    if (containsCredentialShapedEvidenceText(extraction.text)) throw new EvidenceContentError(403, "Content requires credential-risk review before reading or search.");
    extractionHash = selected.payload.outputHash as Hash;
  }
  // An awaited storage read is not a lasting authorization grant.
  authorizeEvidence(await workspace.ledger.readAll(), evidenceId, actor);
  return { item, extraction, extractionHash, extractions: completed.map(event => {
    if (event.type !== "ingestion.parse.completed") throw new Error("Invalid extraction event");
    return { extractionId: event.payload.parseJobId, contentHash: event.payload.outputHash, parser: event.payload.parser, completedAt: event.payload.completedAt };
  }), failures: events.filter(event => event.type === "ingestion.parse.failed" && event.payload.evidenceId === evidenceId).map(event => {
    if (event.type !== "ingestion.parse.failed") throw new Error("Invalid failure event");
    return { jobId: event.payload.parseJobId, message: event.payload.message, retryable: event.payload.retryable, failedAt: event.payload.failedAt };
  }) };
}

export async function readEvidenceOriginal(workspace: MountedWorkspace, actor: ActorRef, evidenceId: string) {
  const events = await workspace.ledger.readAll();
  const item = authorizeEvidence(events, evidenceId, actor);
  const bytes = await workspace.blobStore.get(item.contentHash as Hash);
  if ((item.mediaType?.startsWith("text/") || item.mediaType === "application/csv") && containsCredentialShapedEvidenceText(bytes.toString("utf8"))) throw new EvidenceContentError(403, "Original requires credential-risk review.");
  // A binary original must honor credential material already found by extraction.
  // No completed extraction is required for recovering an unparsed original.
  for (const event of events) {
    if (event.type === "ingestion.parse.completed" && event.payload.evidenceId === evidenceId && event.payload.outputMediaType === extractionMediaType) {
      await readEvidenceContent(workspace, actor, evidenceId, event.payload.parseJobId);
    }
  }
  authorizeEvidence(await workspace.ledger.readAll(), evidenceId, actor);
  return { evidenceId, contentHash: item.contentHash, mediaType: item.mediaType, base64: bytes.toString("base64") };
}

/** SQLite is a disposable projection; originals and extraction events rebuild it. */
export async function searchEvidence(workspace: MountedWorkspace, actor: ActorRef, input: { q: string; sourceCollectionId?: string; format?: string; limit: number; offset: number }) {
  if (!input.q.trim() || input.q.length > 500 || !Number.isInteger(input.limit) || input.limit < 1 || input.limit > 50 || !Number.isInteger(input.offset) || input.offset < 0 || input.offset > 100_000 || (input.format && !["text", "csv", "pdf"].includes(input.format))) throw new EvidenceContentError(400, "Enter a phrase up to 500 characters and valid pagination or filters.");
  const events = await workspace.ledger.readAll();
  const items = buildEvidenceWorkspaceDto(events).items;
  const documents: Awaited<ReturnType<typeof readEvidenceContent>>[] = [];
  for (const item of items) {
    try { const document = await readEvidenceContent(workspace, actor, item.evidenceId); if (document.extraction) documents.push(document); }
    catch { /* Exclude inaccessible or corrupt derivatives; never return stale snippets. */ }
  }
  // All entries are re-authorized and hash-verified each query. Small-corpus scope;
  // the cache is rebuilt transactionally and never treated as authority.
  await workspace.ledger.readAll();
  const db = new DatabaseSync(workspace.projectionCacheRoot ? join(workspace.projectionCacheRoot, "evidence-search.sqlite") : ":memory:");
  try {
    db.exec("CREATE VIRTUAL TABLE IF NOT EXISTS evidence_passages USING fts5(evidence_id UNINDEXED, extraction_id UNINDEXED, passage_index UNINDEXED, format UNINDEXED, text)");
    db.exec("BEGIN; DELETE FROM evidence_passages");
    const insert = db.prepare("INSERT INTO evidence_passages VALUES (?, ?, ?, ?, ?)");
    for (const document of documents) {
      if (input.sourceCollectionId && !document.item.sourceCollections.some(source => source.sourceCollectionId === input.sourceCollectionId)) continue;
      for (const [index, passage] of document.extraction!.passages.entries()) insert.run(document.item.evidenceId, document.extraction!.extractionId, index, document.extraction!.format, passage.text);
    }
    db.exec("COMMIT");
    const phrase = `"${input.q.trim().replaceAll('"', '""')}"`;
    const filter = "evidence_passages MATCH ? AND (? = '' OR format = ?)";
    const params = [phrase, input.format ?? "", input.format ?? ""];
    const total = Number(db.prepare(`SELECT count(*) AS total FROM evidence_passages WHERE ${filter}`).get(...params)?.total ?? 0);
    const rows = db.prepare(`SELECT evidence_id, extraction_id, passage_index, snippet(evidence_passages, 4, '', '', ' … ', 30) AS snippet FROM evidence_passages WHERE ${filter} ORDER BY rank, evidence_id, passage_index LIMIT ? OFFSET ?`).all(...params, input.limit, input.offset);
    const currentEvents = await workspace.ledger.readAll();
    const results = rows.flatMap(row => {
      try { authorizeEvidence(currentEvents, String(row.evidence_id), actor); } catch { return []; }
      const document = documents.find(doc => doc.item.evidenceId === row.evidence_id)!;
      return [{ evidenceId: String(row.evidence_id), extractionId: String(row.extraction_id), passageIndex: Number(row.passage_index), locator: document.extraction!.passages[Number(row.passage_index)]!.locator, snippet: String(row.snippet), label: [...new Set(document.item.occurrences.map(occurrence => occurrence.sourcePath))].join(", ") || String(row.evidence_id) }];
    });
    return { total: results.length === rows.length ? total : results.length, results, limit: input.limit, offset: input.offset };
  } finally { db.close(); }
}

export async function resolveExternalDocumentSelection(workspace: MountedWorkspace, actor: ActorRef, selection: { evidenceId: string; extractionId: string; passageIndexes: readonly number[] }) {
  const content = await readEvidenceContent(workspace, actor, selection.evidenceId, selection.extractionId);
  if (!content.extraction || !content.extractionHash) throw new EvidenceContentError(409, "A completed extraction is required.");
  const events = await workspace.ledger.readAll();
  authorizeEvidence(events, selection.evidenceId, actor);
  const governance = buildGovernanceProjection(events).evidenceGovernance.get(selection.evidenceId);
  const publicSafe = governance?.currentTags.get("public_safe");
  if (publicSafe?.status !== "active" || publicSafe.source !== "human" || !events.some(event => event.id === publicSafe.eventId && event.type === "evidence.governance.reviewed") || restrictedExportTags.some(tag => governance?.currentTags.get(tag)?.status === "active")) throw new EvidenceContentError(403, "Review this evidence as public_safe and resolve restricted classifications before external processing.");
  const indexes = selection.passageIndexes;
  if (!indexes.length || indexes.length > 100 || new Set(indexes).size !== indexes.length || indexes.some(index => !Number.isInteger(index) || index < 0 || !content.extraction!.passages[index])) throw new EvidenceContentError(400, "Select 1–100 exact existing passages.");
  const policyEvents = events.filter(event => ("evidenceId" in event.payload && event.payload.evidenceId === selection.evidenceId) || event.type === "governance.policy.installed");
  return { evidenceId: selection.evidenceId, extractionId: selection.extractionId, sourceHash: content.item.contentHash as Hash, extractionHash: content.extractionHash, policyRevision: hash(JSON.stringify({ policy: activeGovernancePolicyRef(events), events: policyEvents.map(event => event.id) })), classification: "public_safe" as const, classificationEventId: publicSafe.eventId, reviewEventId: publicSafe.eventId, passages: indexes.map(index => ({ index, text: content.extraction!.passages[index]!.text, locator: content.extraction!.passages[index]!.locator })) };
}
