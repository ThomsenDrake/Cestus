import type { KnowledgeCitation, KnowledgeValue } from "../../../ontology/src/knowledge-contracts.js";
import type { ExtractionArtifact } from "../../../ontology/src/extraction-contracts.js";

export type { ReviewedKnowledgeProposal as ReviewProposal, KnowledgeWorkspaceDto as SharedKnowledge } from "../../../ontology/src/knowledge-projection.js";
import type { ReviewedKnowledgeProposal as ReviewProposal, KnowledgeWorkspaceDto as SharedKnowledge } from "../../../ontology/src/knowledge-projection.js";
export type SourceItem = { evidenceId: string; source?: { label: string }; occurrences: { sourcePath: string }[] };
export type SourceContent = { item: SourceItem; extraction?: ExtractionArtifact; extractionHash?: string; citations: KnowledgeCitation[] };

export async function knowledgeRequest<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, { credentials: "same-origin", headers: { accept: "application/json", ...(body === undefined ? {} : { "content-type": "application/json" }) }, ...(body === undefined ? {} : { method: "POST", body: JSON.stringify(body) }) });
  const value = await response.json();
  if (!response.ok || value.ok === false) throw new Error(typeof value.message === "string" ? value.message : "This decision could not be saved. Refresh and review current evidence and decisions before retrying.");
  return value as T;
}
export const newKnowledgeId = (prefix: string) => `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
export function displayValue(value: KnowledgeValue, proposals: readonly ReviewProposal[] = [], entities: SharedKnowledge["entities"] = [], bindings: readonly Pick<SharedKnowledge["bindings"][number], "mentionId" | "entityId">[] = []) {
  if (value.type !== "entity") return `${value.value}${value.type === "number" && value.unit ? ` ${value.unit}` : ""}`;
  const binding = bindings.find(candidate => candidate.mentionId === value.mentionId);
  const entity = binding && entities.find(candidate => candidate.entityId === binding.entityId);
  if (entity) return entity.canonicalLabel;
  const proposed = proposals.findLast(candidate => candidate.mentionId === value.mentionId && candidate.reviewState === "proposed");
  return proposed?.value.type === "string" ? proposed.value.value : `Unresolved mention ${value.mentionId}`;
}
export const sourceLabel = (item: SourceItem) => item.occurrences.map(occurrence => occurrence.sourcePath).join(", ") || item.source?.label || item.evidenceId;

/** Suggestions describe evidence to inspect; they never choose or bind an identity. */
export function suggestEntityMatches(proposal: ReviewProposal, workspace: SharedKnowledge) {
  const current = workspace.bindings.find(binding => binding.mentionId === proposal.mentionId)?.entityId;
  const attributes = workspace.proposals.filter(p => p.reviewState === "accepted" && p.subjectMentionId === proposal.mentionId && ["identifier", "address"].includes(p.predicate));
  return workspace.entities.filter(entity => entity.entityId !== current && entity.entityType === proposal.entityType).flatMap(entity => {
    const supported = attributes.flatMap(attribute => workspace.proposals.some(other => other.reviewState === "accepted" && other.subjectEntityId === entity.entityId && other.predicate === attribute.predicate && displayValue(other.value) === displayValue(attribute.value)) ? [`Same reviewed ${attribute.predicate}: ${displayValue(attribute.value)}`] : []);
    const sameName = proposal.value.type === "string" && entity.canonicalLabel.trim().toLocaleLowerCase() === proposal.value.value.trim().toLocaleLowerCase();
    if (!supported.length && !sameName) return [];
    return [{ entity, reasons: supported.length ? supported : ["Similar name only; identity is unverified"], strength: supported.length }];
  }).sort((a, b) => b.strength - a.strength || a.entity.entityId.localeCompare(b.entity.entityId)).slice(0, 10);
}
