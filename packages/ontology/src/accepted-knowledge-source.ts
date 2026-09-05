import type { KnowledgeEvent } from "./contracts.js";
import type { KnowledgeGraphProjection } from "./graph-projection.js";

/** Compatibility for report/timeline consumers that still use a primary evidence ID.
 * Full passage and binding history stays addressable through sourceEventIds.
 */
export function acceptedKnowledgeSource(graph: KnowledgeGraphProjection, events: readonly KnowledgeEvent[], assertionId: string) {
  const assertion = graph.assertions.get(assertionId);
  const proposal = graph.knowledge.proposals.find(item => item.assertionId === assertionId);
  if (!assertion || !proposal || proposal.reviewState !== "accepted" || !assertion.acceptedByEventId) return undefined;
  const review = events.find(event => event.id === assertion.acceptedByEventId);
  const schema = events.find(event => event.type === "knowledge.schema.recorded" && event.payload.schemaId === proposal.schemaId);
  if (review?.type !== "knowledge.reviewed" || review.payload.action !== "accept" || review.context.actor.kind !== "human" || review.payload.proposalEventId !== proposal.proposalEventId || !schema) return undefined;
  const mentions = new Set([proposal.mentionId, proposal.subjectMentionId, ...(proposal.value.type === "entity" ? [proposal.value.mentionId] : []), ...(proposal.participants ?? []).map(participant => participant.mentionId)]);
  const bindingIds = graph.knowledge.bindings.filter(binding => mentions.has(binding.mentionId)).map(binding =>
    graph.knowledge.bindingHistory.findLast(event => event.mentionId === binding.mentionId)?.eventId
  ).filter((id): id is string => id !== undefined);
  return {
    assertionId, evidenceId: proposal.evidence[0]!.evidenceId,
    evidenceContentHash: proposal.evidence[0]!.sourceContentHash as `sha256:${string}`,
    proposedByEventId: proposal.proposalEventId, acceptedByEventId: review.id,
    sourceEventIds: [...new Set([schema.id, proposal.proposalEventId, review.id, ...bindingIds, ...proposal.evidence.flatMap(ref => ref.provenanceEventIds)])].sort(),
    evidence: proposal.evidence,
    safeStatement: `${proposal.predicate}: ${String(assertion.object)}${proposal.occurredTime ? ` (occurred ${proposal.occurredTime.start}${proposal.occurredTime.uncertain ? ", uncertain" : ""})` : ""}`
  };
}
