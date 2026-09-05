import { createHash } from "node:crypto";
import { z } from "zod";
import {
  actorRefSchema,
  type ActorRef,
  type AppendableKnowledgeEvent,
  type KnowledgeEvent,
} from "./contracts.js";
import { ConcurrencyConflictError, hasAtomicAppendBatch, type EventLedger } from "./event-ledger.js";
import {
  investigationVocabulary,
  isKnowledgeValueGrounded,
  knowledgePayloadSchemas,
  knowledgeProposalSchema,
  type KnowledgeCitation,
  type KnowledgeProposal,
  type KnowledgeValue,
  type KnowledgeV2Type,
} from "./knowledge-contracts.js";
import { buildOntologyWorkspaceReadDto } from "./ontology-workspace-read.js";
import { buildGraphProjection } from "./graph-projection.js";
import type {
  KnowledgeWorkspaceDto,
  ReviewedKnowledgeProposal,
} from "./knowledge-projection.js";
export type { KnowledgeWorkspaceDto } from "./knowledge-projection.js";
const id = z.string().min(1).max(200),
  rationale = z.string().min(1).max(10000);
const common = {
  decisionId: z.string().regex(/^[A-Za-z0-9_.:-]{1,200}$/),
  expectedRevision: z.number().int().nonnegative(),
};
const review = z
  .object({
    assertionId: id,
    proposalEventId: id,
    action: z.enum(["accept", "reject", "withdraw", "supersede", "dispute"]),
    rationale,
    replacementId: id.optional(),
    entityId: z
      .string()
      .regex(/^ent_[a-zA-Z0-9_-]+$/)
      .optional(),
  })
  .strict();
export const knowledgeCommandSchema = z.discriminatedUnion("action", [
  z
    .object({
      ...common,
      action: z.literal("createCase"),
      ...knowledgePayloadSchemas["investigation.created"].shape,
    })
    .strict(),
  z
    .object({
      ...common,
      action: z.literal("selectCase"),
      ...knowledgePayloadSchemas["investigation.selected"].shape,
    })
    .strict(),
  z
    .object({
      ...common,
      action: z.literal("membership"),
      ...knowledgePayloadSchemas["investigation.membership.changed"].shape,
    })
    .strict(),
  z
    .object({
      ...common,
      action: z.literal("hypothesis"),
      ...knowledgePayloadSchemas["investigation.hypothesis.recorded"].shape,
    })
    .strict(),
  z
    .object({
      ...common,
      action: z.literal("propose"),
      proposals: z.array(knowledgeProposalSchema).min(1).max(40),
    })
    .strict(),
  z
    .object({
      ...common,
      action: z.literal("review"),
      reviews: z.array(review).min(1).max(40),
    })
    .strict(),
  z
    .object({
      ...common,
      action: z.literal("bind"),
      mentionId: id,
      entityId: z.string().regex(/^ent_[a-zA-Z0-9_-]+$/),
      previousEntityId: id.nullable(),
      assertionId: id,
      rationale,
    })
    .strict(),
  z
    .object({
      ...common,
      action: z.literal("lineage"),
      ...knowledgePayloadSchemas["knowledge.source.lineage"].shape,
    })
    .strict(),
]);
export type KnowledgeCommand = z.infer<typeof knowledgeCommandSchema>;
export interface KnowledgeServiceOptions {
  ledger: EventLedger;
  workspaceId: string;
  resolveCitation: (ref: KnowledgeCitation, actor: ActorRef) => Promise<void>;
  authorizeEvidence?: (evidenceId: string, actor: ActorRef) => Promise<void>;
}
export class KnowledgeCommandError extends Error {
  readonly code = "KNOWLEDGE_COMMAND_INVALID";
}
export class KnowledgeService {
  constructor(private readonly options: KnowledgeServiceOptions) {}
  async read(actor?: ActorRef): Promise<KnowledgeWorkspaceDto> {
    const events = await this.options.ledger.readAll();
    if (!actor)
      return {
        ...buildGraphProjection(events).knowledge,
        workspaceId: this.options.workspaceId,
      };
    const filtered = await this.readableEvents(events, actor);
    const allowedAssertions = new Set(filtered.flatMap(event => event.type === "knowledge.proposed" ? [event.payload.assertionId] : []));
    const dto = buildGraphProjection(filtered).knowledge;
    const entities = new Set(dto.entities.map((e) => e.entityId));
    dto.memberships = dto.memberships.filter(
      (m) => m.targetKind !== "entity" || entities.has(m.targetId),
    );
    dto.hypotheses = dto.hypotheses.map((h) => ({
      ...h,
      supporting: h.supporting.filter((id) => allowedAssertions.has(id)),
      contradicting: h.contradicting.filter((id) => allowedAssertions.has(id)),
      currentSupporting: h.currentSupporting.filter((id) =>
        allowedAssertions.has(id),
      ),
      currentContradicting: h.currentContradicting.filter((id) =>
        allowedAssertions.has(id),
      ),
    }));
    return {
      ...dto,
      workspaceId: this.options.workspaceId,
      revision: events.length,
    };
  }
  async readLegacy(actor: ActorRef) {
    const events = await this.options.ledger.readAll();
    const filtered = await this.readableEvents(events, actor);
    return { ...buildOntologyWorkspaceReadDto(filtered), sourceHighWaterMark: events.length };
  }
  private async readableEvents(events: KnowledgeEvent[], actor: ActorRef): Promise<KnowledgeEvent[]> {
    actorRefSchema.parse(actor);
    if (actor.kind !== "human")
      throw new KnowledgeCommandError(
        "Knowledge reads require an authenticated human session.",
      );
    const denied = new Set<string>();
    const allowedAssertions = new Set<string>();
    for (const event of events) {
      if (event.type === "knowledge.proposed") {
        try {
          for (const citation of event.payload.evidence)
            await this.options.resolveCitation(citation, actor);
          allowedAssertions.add(event.payload.assertionId);
        } catch {
          event.payload.evidence.forEach((e) => denied.add(e.evidenceId));
        }
      }
      if (
        event.type === "evidence.ingested" &&
        this.options.authorizeEvidence
      ) {
        try {
          await this.options.authorizeEvidence(event.payload.evidenceId, actor);
        } catch {
          denied.add(event.payload.evidenceId);
        }
      }
    }
    if ((await this.options.ledger.readAll()).length !== events.length)
      throw new ConcurrencyConflictError(
        "Knowledge read changed during authority validation; retry.",
      );
    for (const event of events)
      if (
        event.type === "knowledge.proposed" &&
        event.payload.evidence.some((e) => denied.has(e.evidenceId))
      )
        allowedAssertions.delete(event.payload.assertionId);
    return events.filter((event) => {
      if (event.type === "knowledge.proposed")
        return (
          allowedAssertions.has(event.payload.assertionId) &&
          !event.payload.evidence.some((e) => denied.has(e.evidenceId))
        );
      if (event.type === "knowledge.source.lineage")
        return !denied.has(event.payload.evidenceId);
      if (event.type === "knowledge.mention.bound")
        return allowedAssertions.has(event.payload.assertionId);
      if (event.type === "investigation.membership.changed")
        return event.payload.targetKind === "evidence"
          ? !denied.has(event.payload.targetId)
          : event.payload.targetKind === "knowledge"
            ? allowedAssertions.has(event.payload.targetId)
            : true;
      if (event.type === "assertion.proposed")
        return !denied.has(event.payload.evidenceId);
      return true;
    });
  }
  async execute(
    input: unknown,
    actorInput: ActorRef,
  ): Promise<KnowledgeEvent[]> {
    try {
      return await this.executeValidated(input, actorInput);
    } catch (error) {
      if (error instanceof ConcurrencyConflictError) throw error;
      if (error instanceof z.ZodError)
        throw new KnowledgeCommandError(
          "Invalid knowledge command. Check required fields, supported types and source references.",
        );
      if (error instanceof KnowledgeCommandError) throw error;
      throw new KnowledgeCommandError(
        "Knowledge command failed validation or evidence authorization.",
      );
    }
  }
  private async executeValidated(
    input: unknown,
    actorInput: ActorRef,
  ): Promise<KnowledgeEvent[]> {
    const actor = actorRefSchema.parse(actorInput);
    if (actor.kind !== "human")
      throw new KnowledgeCommandError(
        "Knowledge decisions require an authenticated human session.",
      );
    const command = knowledgeCommandSchema.parse(input);
    const events = await this.options.ledger.readAll();
    const streamId = `knowledge-decision:${command.decisionId}`;
    const receipt = events.filter((e) => e.streamId === streamId);
    const fingerprint = hash({
      command,
      actor,
      workspaceId: this.options.workspaceId,
    });
    if (receipt.length && receipt[0]!.context.correlationId !== fingerprint)
      throw new ConcurrencyConflictError(
        "Decision identity already has different content.",
      );
    if (!receipt.length && events.length !== command.expectedRevision)
      throw new ConcurrencyConflictError(
        "Knowledge decision is stale; refresh before reviewing.",
      );
    const historical = receipt.length
      ? events.slice(0, command.expectedRevision)
      : events;
    const dto = buildGraphProjection(historical).knowledge;
    const current = receipt.length ? buildGraphProjection(events).knowledge : dto;
    const context = {
      actor,
      occurredAt: receipt[0]?.context.occurredAt ?? new Date().toISOString(),
      correlationId: fingerprint,
      coreVersion: "2",
      packVersions: { knowledge: investigationVocabulary.schemaId },
    };
    const batch: AppendableKnowledgeEvent[] = [];
    const emit = (
      type: KnowledgeV2Type,
      payload: unknown,
      causationId?: string,
    ) => {
      const parsed = knowledgePayloadSchemas[type].parse(payload);
      batch.push({
        type,
        version: 2,
        streamId,
        context: { ...context, ...(causationId ? { causationId } : {}) },
        payload: parsed,
      } as AppendableKnowledgeEvent);
    };
    const ensureCase = (caseId: string) => {
      if (!dto.cases.some((c) => c.caseId === caseId))
        throw new KnowledgeCommandError("Unknown investigation.");
    };
    const authorize = async (evidenceId: string) => {
      if (!this.options.authorizeEvidence)
        throw new KnowledgeCommandError("Evidence authority is unavailable.");
      await this.options.authorizeEvidence(evidenceId, actor);
    };
    switch (command.action) {
      case "createCase":
        if (dto.cases.some((c) => c.caseId === command.caseId))
          throw new KnowledgeCommandError("Investigation already exists.");
        emit(
          "investigation.created",
          pick(command, ["caseId", "title", "question", "scope", "notes"]),
        );
        break;
      case "selectCase":
        if (command.caseId) ensureCase(command.caseId);
        emit("investigation.selected", { caseId: command.caseId });
        break;
      case "membership": {
        ensureCase(command.caseId);
        if (command.targetKind === "evidence")
          await authorize(command.targetId);
        if (command.targetKind === "knowledge") {
          const p = dto.proposals.find(
            (p) => p.assertionId === command.targetId,
          );
          if (!p) throw new KnowledgeCommandError("Unknown knowledge.");
          await this.validateEvidence(p, actor);
        }
        if (command.targetKind === "entity") {
          const entity = dto.entities.find(
            (e) => e.entityId === command.targetId,
          );
          if (!entity) throw new KnowledgeCommandError("Unknown entity.");
          for (const p of dto.proposals.filter((p) =>
            entity.assertionIds.includes(p.assertionId),
          ))
            await this.validateEvidence(p, actor);
        }
        emit(
          "investigation.membership.changed",
          pick(command, ["caseId", "targetKind", "targetId", "included"]),
        );
        break;
      }
      case "hypothesis":
        ensureCase(command.caseId);
        for (const assertionId of [
          ...command.supporting,
          ...command.contradicting,
        ]) {
          const p = dto.proposals.find((p) => p.assertionId === assertionId);
          if (!p)
            throw new KnowledgeCommandError("Unknown hypothesis evidence.");
          await this.validateEvidence(p, actor);
        }
        emit(
          "investigation.hypothesis.recorded",
          pick(command, [
            "caseId",
            "hypothesisId",
            "statement",
            "supporting",
            "contradicting",
          ]),
        );
        break;
      case "propose": {
        if (!dto.schema)
          emit("knowledge.schema.recorded", investigationVocabulary);
        const seen = new Set(dto.proposals.map((p) => p.assertionId));
        const mentions = new Set(
          dto.proposals
            .filter((p) => p.kind === "entity")
            .map((p) => p.mentionId),
        );
        for (const p of command.proposals) {
          if (seen.has(p.assertionId))
            throw new KnowledgeCommandError(
              "Proposal identity already exists; edits require a new proposal.",
            );
          seen.add(p.assertionId);
          if (
            p.kind === "entity" &&
            mentions.has(p.mentionId) &&
            !dto.proposals.some(
              (prior) =>
                prior.assertionId === p.derivedFrom &&
                prior.mentionId === p.mentionId,
            )
          )
            throw new KnowledgeCommandError(
              "Source mention already exists; use a new mention for a replacement proposal.",
            );
          if (p.kind === "entity") mentions.add(p.mentionId);
          await this.validateEvidence(p, actor);
          this.validateShape(p, dto, false);
          if (
            p.schemaId !==
            (current.schema?.schemaId ?? investigationVocabulary.schemaId)
          )
            throw new KnowledgeCommandError("Schema version is stale.");
          if (
            p.derivedFrom &&
            !dto.proposals.some((prior) => prior.assertionId === p.derivedFrom)
          )
            throw new KnowledgeCommandError("Unknown original proposal.");
          emit("knowledge.proposed", p);
        }
        break;
      }
      case "review": {
        const ids = new Set<string>();
        const virtual = structuredClone(dto);
        // Entity acceptance within this bounded group may supply endpoints to later items.
        const ordered = [...command.reviews].sort(
          (a, b) =>
            Number(
              dto.proposals.find((p) => p.assertionId === b.assertionId)
                ?.kind === "entity",
            ) -
            Number(
              dto.proposals.find((p) => p.assertionId === a.assertionId)
                ?.kind === "entity",
            ),
        );
        for (const item of ordered) {
          if (ids.has(item.assertionId))
            throw new KnowledgeCommandError(
              "An assertion can be reviewed only once per decision.",
            );
          ids.add(item.assertionId);
          const p = dto.proposals.find(
            (p) => p.assertionId === item.assertionId,
          );
          if (!p || p.proposalEventId !== item.proposalEventId)
            throw new ConcurrencyConflictError("Proposal review is stale.");
          await this.validateEvidence(p, actor);
          if (item.action === "accept" || item.action === "reject") {
            if (p.reviewState !== "proposed")
              throw new ConcurrencyConflictError(
                "Proposal has already been reviewed.",
              );
          }
          if (
            ["withdraw", "supersede"].includes(item.action) &&
            p.reviewState !== "accepted"
          )
            throw new KnowledgeCommandError(
              "Only accepted knowledge can be withdrawn or superseded.",
            );
          if (item.action === "accept") {
            this.validateShape(p, virtual, true);
            await this.validateEndpoints(p, virtual, actor);
            if (
              p.schemaId !== current.schema?.schemaId ||
              !p.schemaSnapshot ||
              hash(p.schemaSnapshot) !== hash(current.schema)
            )
              throw new KnowledgeCommandError("Review schema is stale.");
            if (p.kind === "entity") {
              const entityId = item.entityId ?? `ent_${p.assertionId.slice(3)}`;
              const existing = virtual.entities.find(
                (e) => e.entityId === entityId,
              );
              if (existing && existing.entityType !== p.entityType)
                throw new KnowledgeCommandError(
                  "Entity binding type does not match.",
                );
              if (existing)
                for (const support of dto.proposals.filter((s) =>
                  existing.assertionIds.includes(s.assertionId),
                ))
                  await this.validateEvidence(support, actor);
              const binding = {
                mentionId: p.mentionId!,
                entityId,
                entityType: p.entityType!,
                label: String(p.value.type !== "entity" ? p.value.value : ""),
                assertionId: p.assertionId,
                previousEntityId:
                  virtual.bindings.find(
                    (binding) => binding.mentionId === p.mentionId,
                  )?.entityId ?? null,
                rationale: item.rationale,
                decisionId: command.decisionId,
              };
              virtual.bindings = virtual.bindings.filter(
                (prior) => prior.mentionId !== binding.mentionId,
              );
              virtual.bindings.push(binding);
              if (!existing)
                virtual.entities.push({
                  entityId,
                  canonicalLabel: binding.label,
                  entityType: binding.entityType,
                  assertionIds: [p.assertionId],
                  caseIds: [],
                  evidenceIds: [],
                  independentSourceCount: 0,
                  sourceIndependence: "uncertain",
                });
              emit("knowledge.mention.bound", binding, p.proposalEventId);
            }
          }
          if (item.action === "supersede") {
            const replacement = virtual.proposals.find(
              (r) => r.assertionId === item.replacementId,
            );
            const acceptedInGroup = command.reviews.some(
              (r) =>
                r.assertionId === item.replacementId && r.action === "accept",
            );
            if (
              !replacement ||
              replacement.assertionId === p.assertionId ||
              (replacement.reviewState !== "accepted" && !acceptedInGroup)
            )
              throw new KnowledgeCommandError(
                "Correction requires an accepted replacement or its acceptance in the same decision.",
              );
            await this.validateEvidence(replacement, actor);
          }
          emit(
            "knowledge.reviewed",
            {
              ...pick(item, [
                "assertionId",
                "proposalEventId",
                "action",
                "rationale",
              ]),
              ...(item.replacementId
                ? { replacementId: item.replacementId }
                : {}),
              decisionId: command.decisionId,
            },
            p.proposalEventId,
          );
        }
        break;
      }
      case "bind": {
        const p = dto.proposals.find(
          (p) =>
            p.assertionId === command.assertionId &&
            p.mentionId === command.mentionId &&
            p.reviewState === "accepted",
        );
        const previous = dto.bindings.find(
          (b) => b.mentionId === command.mentionId,
        );
        if (!p || previous?.entityId !== command.previousEntityId)
          throw new ConcurrencyConflictError(
            "Identity binding is stale or unsupported.",
          );
        await this.validateEvidence(p, actor);
        const entity = dto.entities.find(
          (e) => e.entityId === command.entityId,
        );
        if (entity && entity.entityType !== p.entityType)
          throw new KnowledgeCommandError(
            "Entity binding type does not match.",
          );
        if (entity)
          for (const support of dto.proposals.filter((s) =>
            entity.assertionIds.includes(s.assertionId),
          ))
            await this.validateEvidence(support, actor);
        emit(
          "knowledge.mention.bound",
          {
            ...pick(command, [
              "mentionId",
              "entityId",
              "previousEntityId",
              "assertionId",
              "rationale",
            ]),
            entityType: p.entityType,
            label: p.value.type !== "entity" ? String(p.value.value) : "",
            decisionId: command.decisionId,
          },
          p.proposalEventId,
        );
        break;
      }
      case "lineage":
        await authorize(command.evidenceId);
        emit(
          "knowledge.source.lineage",
          pick(command, [
            "evidenceId",
            "originId",
            "independence",
            "rationale",
          ]),
        );
        break;
    }
    if (!hasAtomicAppendBatch(this.options.ledger))
      throw new KnowledgeCommandError(
        "Atomic knowledge decisions are unavailable.",
      );
    if ((await this.options.ledger.readAll()).length !== events.length)
      throw new ConcurrencyConflictError(
        "Knowledge authority or decision changed during validation; refresh.",
      );
    return this.options.ledger.appendBatch(batch, {
      decisionId: command.decisionId,
      expectedGlobalEventCount: command.expectedRevision,
    });
  }
  private async validateEvidence(proposal: KnowledgeProposal, actor: ActorRef) {
    if (
      proposal.workspaceId !== this.options.workspaceId ||
      proposal.evidence.some((e) => e.workspaceId !== this.options.workspaceId)
    )
      throw new KnowledgeCommandError("Evidence belongs to another workspace.");
    for (const citation of proposal.evidence)
      await this.options.resolveCitation(citation, actor);
    const quotes = proposal.evidence.map((e) => e.quote);
    const grounded = (value: KnowledgeValue) => {
      if (value.type === "entity") return;
      if (!quotes.some((quote) => isKnowledgeValueGrounded(value, quote)))
        throw new KnowledgeCommandError(
          "Proposed value is not grounded in its source quotation.",
        );
    };
    grounded(proposal.value);
    for (const attribute of proposal.attributes ?? [])
      grounded(attribute.value);
    for (const time of [proposal.occurredTime, proposal.publicationTime])
      if (time)
        for (const value of [time.start, time.end])
          if (value && !quotes.some((quote) => quote.includes(value)))
            throw new KnowledgeCommandError(
              "Time qualifier is not grounded in its source quotation.",
            );
  }
  private async validateEndpoints(
    p: KnowledgeProposal,
    dto: KnowledgeWorkspaceDto,
    actor: ActorRef,
  ) {
    const mentions = [
      p.subjectMentionId,
      p.value.type === "entity" ? p.value.mentionId : undefined,
      ...(p.participants ?? []).map((participant) => participant.mentionId),
      ...(p.attributes ?? []).map((attribute) =>
        attribute.value.type === "entity"
          ? attribute.value.mentionId
          : undefined,
      ),
    ].filter((mention): mention is string => !!mention);
    for (const mention of new Set(mentions)) {
      const binding = dto.bindings.find((b) => b.mentionId === mention);
      const support = dto.proposals.find(
        (proposal) => proposal.assertionId === binding?.assertionId,
      );
      if (!binding || !support)
        throw new KnowledgeCommandError(
          "Endpoint identity lacks source provenance.",
        );
      await this.validateEvidence(support, actor);
      if (
        !p.evidence.some((citation) =>
          citation.quote.toLowerCase().includes(binding.label.toLowerCase()),
        )
      )
        throw new KnowledgeCommandError(
          "Endpoint identity is not grounded in the selected source quotations.",
        );
    }
  }
  private validateShape(
    p: KnowledgeProposal,
    dto: KnowledgeWorkspaceDto,
    accept: boolean,
  ) {
    if (
      p.kind === "entity" &&
      (!p.mentionId || !p.entityType || p.value.type !== "string")
    )
      throw new KnowledgeCommandError(
        "Entity proposal requires a source mention, entity type, and string label.",
      );
    if ((p.kind === "fact" || p.kind === "relationship") && !p.subjectMentionId)
      throw new KnowledgeCommandError(
        "Fact and relationship proposals require a subject mention.",
      );
    if (p.kind === "relationship" && p.value.type !== "entity")
      throw new KnowledgeCommandError(
        "Relationship requires an entity endpoint.",
      );
    if (p.kind === "occurrence" && (!p.occurrenceId || !p.participants?.length))
      throw new KnowledgeCommandError(
        "Occurrence requires identity and evidence-backed participants.",
      );
    const vocabulary = dto.schema ?? investigationVocabulary;
    const predicate = vocabulary.predicates.find(
      (v) => v.name === p.predicate && v.kind === p.kind,
    );
    if (accept && !predicate)
      throw new KnowledgeCommandError(
        "Unknown vocabulary remains proposed until a reviewed schema supports it.",
      );
    if (predicate && predicate.valueType !== p.value.type)
      throw new KnowledgeCommandError("Unsupported predicate value type.");
    if (
      accept &&
      p.entityType &&
      !vocabulary.entityTypes.includes(p.entityType)
    )
      throw new KnowledgeCommandError("Unsupported entity type vocabulary.");
    if (!accept) return;
    const requireMention = (mentionId: string) => {
      const binding = dto.bindings.find((b) => b.mentionId === mentionId);
      if (!binding)
        throw new KnowledgeCommandError(
          "Relationship/participant endpoint requires a reviewed entity binding.",
        );
      return binding;
    };
    if (p.subjectMentionId) {
      const b = requireMention(p.subjectMentionId);
      if (
        predicate?.fromTypes.length &&
        !predicate.fromTypes.includes(b.entityType)
      )
        throw new KnowledgeCommandError("Unsupported subject endpoint type.");
    }
    if (p.value.type === "entity") {
      const b = requireMention(p.value.mentionId);
      if (
        predicate?.toTypes.length &&
        !predicate.toTypes.includes(b.entityType)
      )
        throw new KnowledgeCommandError("Unsupported object endpoint type.");
    }
    for (const participant of p.participants ?? [])
      requireMention(participant.mentionId);
    for (const attribute of p.attributes ?? []) {
      const v = vocabulary.predicates.find(
        (v) => v.name === attribute.predicate && v.kind === "fact",
      );
      if (!v || v.valueType !== attribute.value.type)
        throw new KnowledgeCommandError(
          "Unsupported attribute vocabulary or type.",
        );
      if (attribute.value.type === "entity")
        requireMention(attribute.value.mentionId);
    }
  }
}
function pick<T extends object>(
  value: T,
  keys: readonly string[],
): Record<string, unknown> {
  return Object.fromEntries(
    keys
      .filter((k) => k in value)
      .map((k) => [k, (value as Record<string, unknown>)[k]]),
  );
}
function hash(value: unknown): string {
  return createHash("sha256")
    .update(
      JSON.stringify(value, (_k, v: unknown) =>
        v && typeof v === "object" && !Array.isArray(v)
          ? Object.fromEntries(
              Object.entries(v).sort(([a], [b]) => a.localeCompare(b)),
            )
          : v,
      ),
    )
    .digest("hex");
}
