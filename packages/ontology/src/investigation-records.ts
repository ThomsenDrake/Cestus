import { createHash } from "node:crypto";
import { z } from "zod";
import {
  actorRefSchema,
  type ActorRef,
  type KnowledgeEvent,
  type KnowledgeEventOf,
} from "./contracts.js";
import {
  ConcurrencyConflictError,
  hasAtomicAppendBatch,
  type EventLedger,
} from "./event-ledger.js";
import { buildGraphProjection } from "./graph-projection.js";
import {
  investigationRecordSchema,
  knowledgePayloadSchemas,
  type InvestigationRecord,
  type KnowledgeCitation,
} from "./knowledge-contracts.js";

export const investigationRecordCommandSchema = z
  .object({
    decisionId: z.string().regex(/^[A-Za-z0-9_.:-]{1,200}$/),
    expectedRevision: z.number().int().nonnegative(),
    record: investigationRecordSchema,
  })
  .strict();
type SavedEvent = KnowledgeEventOf<"investigation.record.saved">;
type SavedRecord = SavedEvent["payload"];
export interface InvestigationRecordView extends InvestigationRecord {
  eventId: string;
  savedAt: string;
  actorId: string;
  staleAssertionIds: string[];
  history: {
    eventId: string;
    savedAt: string;
    actorId: string;
    status: InvestigationRecord["status"];
  }[];
}
export interface InvestigationRecordsOptions {
  ledger: EventLedger;
  workspaceId: string;
  resolveCitation: (
    citation: KnowledgeCitation,
    actor: ActorRef,
  ) => Promise<void>;
}
export class InvestigationRecordError extends Error {
  readonly code = "INVESTIGATION_RECORD_INVALID";
}

/** Local human work products remain separate from accepted ontology assertions. */
export class InvestigationRecordsService {
  constructor(private readonly options: InvestigationRecordsOptions) {}

  async read(
    actorInput: ActorRef,
    input: { caseIds?: string[]; limit?: number } = {},
  ): Promise<{ revision: number; records: InvestigationRecordView[] }> {
    const actor = human(actorInput);
    const query = z
      .object({
        caseIds: z.array(z.string().min(1).max(200)).min(1).max(12).optional(),
        limit: z.number().int().min(1).max(100).default(100),
      })
      .strict()
      .parse(input);
    const events = await this.options.ledger.readAll();
    const records = this.latest(events);
    const knowledge = buildGraphProjection(events).knowledge;
    const proposals = new Map(
      knowledge.proposals.map((proposal) => [proposal.assertionId, proposal]),
    );
    const result: InvestigationRecordView[] = [];
    for (const event of [...records.values()].reverse()) {
      const record = event.payload;
      try {
        await this.validateDependencies(
          record,
          records,
          events,
          actor,
          query.caseIds,
        );
      } catch {
        continue;
      }
      result.push({
        ...investigationRecordSchema.parse(pickRecord(record)),
        eventId: event.id,
        savedAt: event.context.occurredAt,
        actorId: event.context.actor.id,
        staleAssertionIds: record.dependencyAssertionIds.filter(
          (id) =>
            proposals.get(id)?.reviewState !== "accepted" ||
            (record.dependencyAssertionFingerprints ?? []).find(
              (item) => item.assertionId === id,
            )?.fingerprint !== assertionFingerprint(knowledge, id),
        ),
        history: events
          .filter(
            (item): item is SavedEvent =>
              item.type === "investigation.record.saved" &&
              item.payload.workspaceId === this.options.workspaceId &&
              item.payload.recordId === record.recordId,
          )
          .slice(-20)
          .map((item) => ({
            eventId: item.id,
            savedAt: item.context.occurredAt,
            actorId: item.context.actor.id,
            status: item.payload.status,
          })),
      });
      if (result.length >= query.limit) break;
    }
    await this.assertUnchanged(events.length);
    return { revision: events.length, records: result };
  }

  async execute(
    input: unknown,
    actorInput: ActorRef,
  ): Promise<KnowledgeEvent[]> {
    const actor = human(actorInput);
    const command = investigationRecordCommandSchema.parse(input);
    const events = await this.options.ledger.readAll();
    const streamId = `investigation-record-decision:${command.decisionId}`;
    const receipt = events.filter((event) => event.streamId === streamId);
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
        "Investigation record is stale; refresh before saving.",
      );
    const latest = this.latest(events);
    const previous = latest.get(command.record.recordId)?.payload;
    if (previous)
      await this.validateDependencies(previous, latest, events, actor);
    // Retries must still satisfy current authority, including dependencies added by later edits.
    if (receipt.length) {
      await this.assertUnchanged(events.length);
      return receipt;
    }
    if (!hasAtomicAppendBatch(this.options.ledger))
      throw new InvestigationRecordError(
        "Atomic record authority is unavailable.",
      );
    if (previous && previous.kind !== command.record.kind)
      throw new InvestigationRecordError(
        "A saved record's kind cannot change.",
      );
    const knowledge = buildGraphProjection(events).knowledge;
    if (
      command.record.caseIds.some(
        (id) => !knowledge.cases.some((item) => item.caseId === id),
      )
    )
      throw new InvestigationRecordError("An investigation is unavailable.");
    const assertions = assertionDependencies(
      knowledge,
      unique([...command.record.supporting, ...command.record.contradicting]),
    );
    const assertionCitations: KnowledgeCitation[] = [];
    for (const id of assertions) {
      const proposal = knowledge.proposals.find(
        (item) => item.assertionId === id,
      );
      if (!proposal || proposal.reviewState !== "accepted")
        throw new InvestigationRecordError(
          "An accepted assertion is unavailable.",
        );
      assertionCitations.push(...proposal.evidence);
    }
    const related = command.record.relatedRecordId
      ? latest.get(command.record.relatedRecordId)?.payload
      : undefined;
    if (command.record.relatedRecordId && !related)
      throw new InvestigationRecordError("Related record is unavailable.");
    if (related)
      await this.validateDependencies(related, latest, events, actor);
    const dependencyAssertionIds = unique([
      ...(previous?.dependencyAssertionIds ?? []),
      ...(related?.dependencyAssertionIds ?? []),
      ...assertions,
    ]);
    const retainedFingerprints = [
      ...(previous?.dependencyAssertionFingerprints ?? []),
      ...(related?.dependencyAssertionFingerprints ?? []),
    ];
    const payload = knowledgePayloadSchemas["investigation.record.saved"].parse(
      {
        ...command.record,
        // An edit cannot erase a recorded provider/scope association.
        invocationId: command.record.invocationId ?? previous?.invocationId,
        scopeFingerprint:
          command.record.scopeFingerprint ?? previous?.scopeFingerprint,
        workspaceId: this.options.workspaceId,
        decisionId: command.decisionId,
        dependencyCitations: uniqueCitations([
          ...(previous?.dependencyCitations ?? []),
          ...(related?.dependencyCitations ?? []),
          ...assertionCitations,
          ...command.record.citations,
        ]),
        dependencyAssertionIds,
        dependencyAssertionFingerprints: dependencyAssertionIds.map(
          (assertionId) =>
            retainedFingerprints.find(
              (item) => item.assertionId === assertionId,
            ) ?? {
              assertionId,
              fingerprint:
                previous?.dependencyAssertionIds.includes(assertionId) ||
                related?.dependencyAssertionIds.includes(assertionId)
                  ? "unknown"
                  : assertionFingerprint(knowledge, assertionId),
            },
        ),
        dependencyRecordIds: unique([
          ...(previous?.dependencyRecordIds ?? []),
          ...(related?.dependencyRecordIds ?? []),
          ...(command.record.relatedRecordId
            ? [command.record.relatedRecordId]
            : []),
        ]),
        dependencyCaseIds: unique([
          ...(previous?.dependencyCaseIds ?? []),
          ...(related?.dependencyCaseIds ?? []),
          ...command.record.caseIds,
        ]),
      },
    );
    if (payload.dependencyRecordIds.includes(payload.recordId))
      throw new InvestigationRecordError(
        "Related records cannot form a cycle.",
      );
    await this.validateDependencies(payload, latest, events, actor);
    await this.assertUnchanged(events.length);
    return this.options.ledger.appendBatch(
      [
        {
          type: "investigation.record.saved",
          version: 2,
          streamId,
          payload,
          context: {
            actor,
            occurredAt: new Date().toISOString(),
            correlationId: fingerprint,
            coreVersion: "2",
            packVersions: { investigation: "work-products.v1" },
          },
        },
      ],
      {
        decisionId: streamId,
        expectedGlobalEventCount: command.expectedRevision,
      },
    );
  }

  private latest(events: KnowledgeEvent[]): Map<string, SavedEvent> {
    const records = new Map<string, SavedEvent>();
    for (const event of events)
      if (
        event.type === "investigation.record.saved" &&
        event.payload.workspaceId === this.options.workspaceId
      ) {
        records.delete(event.payload.recordId);
        records.set(event.payload.recordId, event);
      }
    return records;
  }

  private async validateDependencies(
    record: SavedRecord,
    records: Map<string, SavedEvent>,
    events: KnowledgeEvent[],
    actor: ActorRef,
    caseIds?: string[],
    visited = new Set<string>(),
  ): Promise<void> {
    if (visited.has(record.recordId)) return;
    if (visited.size >= 24)
      throw new InvestigationRecordError(
        "Related record dependency limit exceeded.",
      );
    visited.add(record.recordId);
    try {
      // Retained prose and current linked records must remain wholly inside the selected scope.
      if (
        caseIds &&
        record.dependencyCaseIds.some((id) => !caseIds.includes(id))
      )
        throw new Error("Outside selected scope");
      for (const citation of record.dependencyCitations) {
        if (citation.workspaceId !== this.options.workspaceId)
          throw new Error("Workspace mismatch");
        await this.options.resolveCitation(citation, actor);
      }
      for (const id of record.dependencyAssertionIds) {
        const proposal = events.find(
          (event) =>
            event.type === "knowledge.proposed" &&
            event.payload.assertionId === id,
        );
        if (!proposal || proposal.type !== "knowledge.proposed")
          throw new Error("Missing dependency");
        for (const citation of proposal.payload.evidence) {
          if (citation.workspaceId !== this.options.workspaceId)
            throw new Error("Workspace mismatch");
          await this.options.resolveCitation(citation, actor);
        }
      }
      for (const id of record.dependencyRecordIds) {
        const related = records.get(id);
        if (!related) throw new Error("Missing dependency");
        await this.validateDependencies(
          related.payload,
          records,
          events,
          actor,
          caseIds,
          visited,
        );
      }
    } catch {
      throw new InvestigationRecordError(
        "Record dependencies are unavailable under current evidence authority.",
      );
    }
  }

  private async assertUnchanged(revision: number): Promise<void> {
    if ((await this.options.ledger.readAll()).length !== revision)
      throw new ConcurrencyConflictError(
        "Record authority changed during validation; refresh and retry.",
      );
  }
}

function human(input: ActorRef): ActorRef {
  const actor = actorRefSchema.parse(input);
  if (actor.kind !== "human")
    throw new InvestigationRecordError(
      "Investigation records require an authenticated human session.",
    );
  return actor;
}
function unique(values: string[]): string[] {
  return [...new Set(values)];
}
function hash(value: unknown): string {
  return createHash("sha256")
    .update(
      JSON.stringify(value, (_key, item: unknown) =>
        item && typeof item === "object" && !Array.isArray(item)
          ? Object.fromEntries(
              Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
            )
          : item,
      ),
    )
    .digest("hex");
}
function uniqueCitations(citations: KnowledgeCitation[]): KnowledgeCitation[] {
  return [
    ...new Map(
      citations.map((citation) => [hash(citation), citation]),
    ).values(),
  ];
}
function pickRecord(record: SavedRecord): InvestigationRecord {
  const {
    workspaceId: _workspace,
    decisionId: _decision,
    dependencyCitations: _citations,
    dependencyAssertionIds: _assertions,
    dependencyRecordIds: _records,
    dependencyCaseIds: _cases,
    dependencyAssertionFingerprints: _fingerprints,
    ...value
  } = record;
  return value;
}

function assertionFingerprint(
  knowledge: ReturnType<typeof buildGraphProjection>["knowledge"],
  id: string,
): string {
  const proposal = knowledge.proposals.find((item) => item.assertionId === id);
  if (!proposal) return hash(null);
  const mentions = new Set(assertionMentions(proposal));
  return hash({
    proposal,
    bindings: knowledge.bindings
      .filter((item) => mentions.has(item.mentionId))
      .sort((a, b) => a.mentionId.localeCompare(b.mentionId)),
  });
}

function assertionDependencies(
  knowledge: ReturnType<typeof buildGraphProjection>["knowledge"],
  ids: string[],
): string[] {
  const result = new Set(ids);
  for (const id of result) {
    if (result.size > 100)
      throw new InvestigationRecordError(
        "Linked assertion dependency limit exceeded.",
      );
    const proposal = knowledge.proposals.find(
      (item) => item.assertionId === id,
    );
    if (!proposal || proposal.reviewState !== "accepted")
      throw new InvestigationRecordError(
        "An accepted assertion is unavailable.",
      );
    const mentions = assertionMentions(proposal);
    for (const mentionId of mentions) {
      const binding = knowledge.bindings.find(
        (item) => item.mentionId === mentionId,
      );
      if (!binding)
        throw new InvestigationRecordError(
          "A linked identity requires review.",
        );
      // Retain the reviewed source mention used by this assertion.
      result.add(binding.assertionId);
    }
  }
  return [...result];
}

function assertionMentions(
  proposal: ReturnType<
    typeof buildGraphProjection
  >["knowledge"]["proposals"][number],
): string[] {
  return [
    proposal.mentionId,
    proposal.subjectMentionId,
    proposal.value.type === "entity" ? proposal.value.mentionId : undefined,
    ...(proposal.participants?.map((item) => item.mentionId) ?? []),
    ...(proposal.attributes?.flatMap((item) =>
      item.value.type === "entity" ? [item.value.mentionId] : [],
    ) ?? []),
  ].filter((item): item is string => Boolean(item));
}
