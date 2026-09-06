import type { KnowledgeEvent, KnowledgeEventOf } from "./contracts.js";
import type {
  KnowledgeProposal,
  KnowledgeValue,
} from "./knowledge-contracts.js";
import type { GraphProjection } from "./graph-projection.js";

export interface KnowledgeReviewHistory {
  eventId: string;
  actorId: string;
  occurredAt: string;
  action: Payload<"knowledge.reviewed">["action"];
  rationale: string;
  replacementId?: string;
}
export interface ReviewedKnowledgeProposal extends KnowledgeProposal {
  proposalEventId: string;
  reviewState:
    "proposed" | "accepted" | "rejected" | "withdrawn" | "superseded";
  history: KnowledgeReviewHistory[];
  schemaSnapshot?: Payload<"knowledge.schema.recorded">;
  subjectEntityId?: string;
  objectEntityId?: string;
}
type Payload<T extends KnowledgeEvent["type"]> = KnowledgeEventOf<T>["payload"];
export interface KnowledgeEntityDto {
  entityId: string;
  canonicalLabel: string;
  entityType: string;
  assertionIds: string[];
  caseIds: string[];
  evidenceIds: string[];
  independentSourceCount: number;
  sourceIndependence: "known" | "uncertain";
}
export interface KnowledgeOccurrenceDto {
  occurrenceId: string;
  assertionIds: string[];
  participants: { role: string; mentionId: string; entityId?: string }[];
  occurredTime?: KnowledgeProposal["occurredTime"];
  publicationTime?: KnowledgeProposal["publicationTime"];
  caseIds: string[];
}
export interface KnowledgeWorkspaceDto {
  workspaceId: string;
  revision: number;
  selectedCaseId: string | null;
  schema: Payload<"knowledge.schema.recorded"> | null;
  schemaHistory?: (Payload<"knowledge.schema.extended"> & { actorId: string; occurredAt: string })[];
  cases: Payload<"investigation.created">[];
  memberships: Payload<"investigation.membership.changed">[];
  hypotheses: (Payload<"investigation.hypothesis.recorded"> & {
    currentSupporting: string[];
    currentContradicting: string[];
  })[];
  proposals: ReviewedKnowledgeProposal[];
  bindings: Payload<"knowledge.mention.bound">[];
  bindingHistory: (Payload<"knowledge.mention.bound"> & {
    eventId: string;
    actorId: string;
    occurredAt: string;
  })[];
  lineage: Payload<"knowledge.source.lineage">[];
  entities: KnowledgeEntityDto[];
  relationships: (GraphProjection["relationships"] extends Map<string, infer R>
    ? R & { caseIds: string[] }
    : never)[];
  occurrences: KnowledgeOccurrenceDto[];
}

/** Enrich the existing authoritative graph in place; every view uses these same maps. */
export function applyKnowledgeEvents(
  graph: GraphProjection,
  events: readonly KnowledgeEvent[],
): KnowledgeWorkspaceDto {
  let workspaceId = "";
  const schemas = new Map<string, Payload<"knowledge.schema.recorded">>();
  const proposals = new Map<string, ReviewedKnowledgeProposal>();
  const bindings = new Map<string, Payload<"knowledge.mention.bound">>();
  const lineage = new Map<string, Payload<"knowledge.source.lineage">>();
  const cases = new Map<string, Payload<"investigation.created">>();
  const memberships = new Map<
    string,
    Payload<"investigation.membership.changed">
  >();
  const hypotheses = new Map<
    string,
    Payload<"investigation.hypothesis.recorded">
  >();
  const bindingHistory: KnowledgeWorkspaceDto["bindingHistory"] = [];
  const schemaHistory: NonNullable<KnowledgeWorkspaceDto["schemaHistory"]> = [];
  let schema: KnowledgeWorkspaceDto["schema"] = null;
  let selectedCaseId: string | null = null;
  for (const event of events) {
    switch (event.type) {
      case "knowledge.schema.extended":
        schemaHistory.push({ ...event.payload, actorId: event.context.actor.id, occurredAt: event.context.occurredAt });
        break;
      case "knowledge.schema.recorded":
        schema = event.payload;
        if (!schemas.has(schema.schemaId)) schemas.set(schema.schemaId, schema);
        break;
      case "investigation.created":
        cases.set(event.payload.caseId, event.payload);
        break;
      case "investigation.selected":
        selectedCaseId = event.payload.caseId;
        break;
      case "investigation.membership.changed":
        memberships.set(
          `${event.payload.caseId}:${event.payload.targetKind}:${event.payload.targetId}`,
          event.payload,
        );
        break;
      case "investigation.hypothesis.recorded":
        hypotheses.set(event.payload.hypothesisId, event.payload);
        break;
      case "knowledge.proposed":
        workspaceId = event.payload.workspaceId;
        proposals.set(event.payload.assertionId, {
          ...event.payload,
          proposalEventId: event.id,
          reviewState: "proposed",
          history: [],
          ...(schemas.has(event.payload.schemaId)
            ? { schemaSnapshot: schemas.get(event.payload.schemaId)! }
            : {}),
        });
        break;
      case "knowledge.reviewed": {
        const proposal = proposals.get(event.payload.assertionId);
        if (
          !proposal ||
          proposal.proposalEventId !== event.payload.proposalEventId
        )
          break;
        const { action, rationale, replacementId } = event.payload;
        const vocabulary = proposal.schemaSnapshot;
        if (
          action === "accept" &&
          (!vocabulary ||
            !vocabulary.predicates.some(
              (p) =>
                p.name === proposal.predicate &&
                p.kind === proposal.kind &&
                p.valueType === proposal.value.type,
            ))
        )
          break;
        proposal.history.push({
          eventId: event.id,
          actorId: event.context.actor.id,
          occurredAt: event.context.occurredAt,
          action,
          rationale,
          ...(replacementId ? { replacementId } : {}),
        });
        if (action !== "dispute")
          proposal.reviewState = (
            {
              accept: "accepted",
              reject: "rejected",
              withdraw: "withdrawn",
              supersede: "superseded",
            } as const
          )[action];
        break;
      }
      case "knowledge.mention.bound":
        bindings.set(event.payload.mentionId, event.payload);
        bindingHistory.push({
          ...event.payload,
          eventId: event.id,
          actorId: event.context.actor.id,
          occurredAt: event.context.occurredAt,
        });
        break;
      case "knowledge.source.lineage":
        lineage.set(event.payload.evidenceId, event.payload);
        break;
    }
  }
  const accepted = [...proposals.values()].filter(
    (p) => p.reviewState === "accepted",
  );
  const activeBindings = new Map(
    [...bindings].filter(
      ([, b]) => proposals.get(b.assertionId)?.reviewState === "accepted",
    ),
  );
  for (const binding of activeBindings.values()) {
    const existing = graph.entities.get(binding.entityId);
    if (existing)
      existing.assertionIds = unique([
        ...existing.assertionIds,
        binding.assertionId,
      ]);
    else
      graph.entities.set(binding.entityId, {
        entityId: binding.entityId,
        canonicalLabel: binding.label,
        entityType: binding.entityType,
        assertionIds: [binding.assertionId],
      });
  }
  for (const proposal of proposals.values()) {
    const subject =
      proposal.subjectMentionId &&
      activeBindings.get(proposal.subjectMentionId);
    const object =
      proposal.value.type === "entity" &&
      activeBindings.get(proposal.value.mentionId);
    if (subject) proposal.subjectEntityId = subject.entityId;
    if (object) proposal.objectEntityId = object.entityId;
    if (proposal.reviewState !== "accepted") continue;
    // Unresolved endpoints remove dependent material from the current accepted graph.
    if (
      (proposal.subjectMentionId && !subject) ||
      (proposal.value.type === "entity" && !object) ||
      proposal.participants?.some((p) => !activeBindings.has(p.mentionId))
    )
      continue;
    graph.assertions.set(proposal.assertionId, {
      assertionId: proposal.assertionId,
      reviewState: "accepted",
      evidenceId: proposal.evidence[0]!.evidenceId,
      predicate: proposal.predicate,
      object: scalar(proposal.value, object ? object.entityId : undefined),
      confidence: proposal.modelScore ?? 0,
      proposedByEventId: proposal.proposalEventId,
      acceptedByEventId: proposal.history.findLast(
        (h) => h.action === "accept",
      )!.eventId,
    });
    const participantEntities = (proposal.participants ?? []).map(
      (participant) => activeBindings.get(participant.mentionId)!.entityId,
    );
    for (const entityId of unique([
      ...(subject ? [subject.entityId] : []),
      ...(object ? [object.entityId] : []),
      ...participantEntities,
    ])) {
      const entity = graph.entities.get(entityId);
      if (entity) entity.assertionIds = unique([...entity.assertionIds, proposal.assertionId]);
    }
    if (proposal.kind === "relationship" && subject && object)
      graph.relationships.set(`rel_${proposal.assertionId.slice(3)}`, {
        relationshipId: `rel_${proposal.assertionId.slice(3)}`,
        fromEntityId: subject.entityId,
        toEntityId: object.entityId,
        relationshipType: proposal.predicate,
        assertionIds: [proposal.assertionId],
        reviewState: "accepted",
        acceptedByEventId: proposal.history.findLast(
          (h) => h.action === "accept",
        )!.eventId,
      });
  }
  const memberList = [...memberships.values()].filter((m) => m.included);
  function casesFor(assertionIds: string[], entityId?: string) {
    const evidenceIds = assertionIds.flatMap(
      (id) => proposals.get(id)?.evidence.map((e) => e.evidenceId) ?? [],
    );
    return unique(
      memberList
        .filter(
          (m) =>
            (m.targetKind === "knowledge" &&
              assertionIds.includes(m.targetId)) ||
            (m.targetKind === "entity" && m.targetId === entityId) ||
            (m.targetKind === "evidence" && evidenceIds.includes(m.targetId)),
        )
        .map((m) => m.caseId),
    );
  }
  const entities: KnowledgeEntityDto[] = [...graph.entities.values()].map(
    (entity) => {
      const citations = entity.assertionIds.flatMap(
        (id) => proposals.get(id)?.evidence ?? [],
      );
      const independentHashes = new Set<string>();
      const independentOrigins = new Set<string>();
      let uncertain = citations.length === 0;
      for (const citation of citations) {
        const source = lineage.get(citation.evidenceId);
        if (!source || source.independence === "unknown") {
          uncertain = true;
          continue;
        }
        if (source.independence !== "independent") continue;
        // Even reviewed independent labels cannot count duplicate bytes or one declared origin twice.
        if (
          !independentHashes.has(citation.sourceContentHash) &&
          !independentOrigins.has(source.originId)
        ) {
          independentHashes.add(citation.sourceContentHash);
          independentOrigins.add(source.originId);
        }
      }
      return {
        ...entity,
        caseIds: casesFor(entity.assertionIds, entity.entityId),
        evidenceIds: unique(citations.map((e) => e.evidenceId)),
        independentSourceCount: independentHashes.size,
        sourceIndependence: uncertain ? "uncertain" : "known",
      };
    },
  );
  const occurrences = new Map<string, KnowledgeOccurrenceDto>();
  for (const p of accepted.filter(
    (p) =>
      p.kind === "occurrence" &&
      p.occurrenceId &&
      graph.assertions.has(p.assertionId),
  )) {
    const prior = occurrences.get(p.occurrenceId!);
    const assertionIds = unique([
      ...(prior?.assertionIds ?? []),
      p.assertionId,
    ]);
    occurrences.set(p.occurrenceId!, {
      occurrenceId: p.occurrenceId!,
      assertionIds,
      participants: (p.participants ?? []).map((participant) => ({
        ...participant,
        ...(activeBindings.has(participant.mentionId)
          ? { entityId: activeBindings.get(participant.mentionId)!.entityId }
          : {}),
      })),
      ...(p.occurredTime ? { occurredTime: p.occurredTime } : {}),
      ...(p.publicationTime ? { publicationTime: p.publicationTime } : {}),
      caseIds: casesFor(assertionIds),
    });
  }
  return {
    workspaceId,
    revision: events.length,
    selectedCaseId,
    schema,
    schemaHistory,
    cases: [...cases.values()],
    memberships: memberList,
    hypotheses: [...hypotheses.values()].map((hypothesis) => ({
      ...hypothesis,
      currentSupporting: hypothesis.supporting.filter((id) =>
        graph.assertions.has(id),
      ),
      currentContradicting: hypothesis.contradicting.filter((id) =>
        graph.assertions.has(id),
      ),
    })),
    proposals: [...proposals.values()],
    bindings: [...activeBindings.values()],
    bindingHistory,
    lineage: [...lineage.values()],
    entities,
    relationships: [...graph.relationships.values()].map((r) => ({
      ...r,
      caseIds: casesFor(r.assertionIds),
    })),
    occurrences: [...occurrences.values()],
  };
}
function scalar(
  value: KnowledgeValue,
  entityId?: string,
): string | number | boolean | null {
  return value.type === "entity" ? (entityId ?? null) : value.value;
}
function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}
