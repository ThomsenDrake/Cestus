import type { z } from "zod";
import {
  actorRefSchema,
  sourceRefSchema,
  type AppendableKnowledgeEvent,
  type KnowledgeEvent,
  type KnowledgeEventOf
} from "./contracts.js";
import type { FileBlobStore } from "./blob-store.js";
import type { EventLedger } from "./event-ledger.js";
import { buildGovernanceProjection } from "./governance-projection.js";

type ActorRef = z.infer<typeof actorRefSchema>;
type SourceRef = z.infer<typeof sourceRefSchema>;

export interface EvidenceIngestionInput {
  evidenceId: string;
  content: Buffer;
  mediaType: string;
  source: SourceRef;
  actor: ActorRef;
}

interface EvidenceServiceDependencies {
  blobStore: FileBlobStore;
  ledger: EventLedger;
}

type AssertionObject = string | number | boolean | null;

export interface EvidenceAssertionCandidateInput {
  assertionId: string;
  evidenceId: string;
  subjectRef?: string;
  predicate: string;
  object: AssertionObject;
  confidence: number;
  actor: ActorRef;
}

export interface EvidenceProposalEligibility {
  readonly evidence?: KnowledgeEventOf<"evidence.ingested">;
  readonly provenanceEventIds: readonly string[];
  readonly provenanceComplete: boolean;
  readonly selectable: boolean;
  readonly blockingReasons: readonly string[];
}

export interface PreparedEvidenceAssertionCandidate {
  readonly assertionId: string;
  readonly evidenceReferences: ReadonlyArray<{
    readonly evidenceId: string;
    readonly contentHash: string;
    readonly eventIds: readonly string[];
  }>;
  readonly reviewState: "proposed";
  readonly reviewRequired: true;
  readonly event: KnowledgeEventOf<"assertion.proposed">;
}

interface EvidenceReviewServiceDependencies {
  readonly ledger: EventLedger;
  readonly now?: () => string;
}

export class EvidenceService {
  constructor(private readonly dependencies: EvidenceServiceDependencies) {}

  async ingest(input: EvidenceIngestionInput): Promise<KnowledgeEventOf<"evidence.ingested">> {
    const stored = await this.dependencies.blobStore.put(input.content);
    const event: AppendableKnowledgeEvent<"evidence.ingested"> = {
      type: "evidence.ingested",
      version: 1,
      streamId: `evidence_${input.evidenceId}`,
      context: {
        actor: input.actor,
        occurredAt: new Date().toISOString(),
        correlationId: `corr_${input.evidenceId}`,
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0" }
      },
      payload: {
        evidenceId: input.evidenceId,
        source: input.source,
        contentHash: stored.contentHash,
        mediaType: input.mediaType,
        sizeBytes: stored.sizeBytes
      }
    };

    const appended = await this.dependencies.ledger.append(event);

    if (appended.type !== "evidence.ingested") {
      throw new Error(`Unexpected event type appended for evidence ingestion: ${appended.type}`);
    }

    return appended;
  }
}

export class EvidenceReviewService {
  constructor(private readonly dependencies: EvidenceReviewServiceDependencies) {}

  async prepareAssertionCandidate(
    input: EvidenceAssertionCandidateInput
  ): Promise<PreparedEvidenceAssertionCandidate> {
    const actor = actorRefSchema.parse(input.actor);
    const events = await this.dependencies.ledger.readAll();
    const eligibility = evaluateEvidenceProposalEligibility(events, input.evidenceId);
    const evidence = eligibility.evidence;

    if (!eligibility.selectable || evidence === undefined) {
      throw new Error(eligibility.blockingReasons[0] ?? "Evidence is not eligible for assertion preparation.");
    }

    const existing = events.find(
      (event): event is KnowledgeEventOf<"assertion.proposed"> =>
        event.type === "assertion.proposed" && event.payload.assertionId === input.assertionId
    );
    if (existing !== undefined) {
      const accepted = events.some((event) =>
        event.type === "assertion.accepted" &&
        event.payload.assertionId === input.assertionId &&
        event.context.causationId === existing.id
      );
      if (accepted) {
        throw new Error("Assertion candidate has already completed human review.");
      }
      if (!sameAssertionProposal(existing, input)) {
        throw new Error("Assertion candidate ID already exists with different proposal content.");
      }
      return preparedCandidate(existing, evidence, eligibility.provenanceEventIds);
    }

    const event: AppendableKnowledgeEvent<"assertion.proposed"> = {
      type: "assertion.proposed",
      version: 1,
      streamId: `assertion_${input.assertionId}`,
      context: {
        actor,
        occurredAt: this.dependencies.now?.() ?? new Date().toISOString(),
        causationId: evidence.id,
        correlationId: `corr_${input.assertionId}`,
        coreVersion: "0.1.0",
        packVersions: { ...evidence.context.packVersions, core: "0.1.0" }
      },
      payload: {
        assertionId: input.assertionId,
        evidenceId: input.evidenceId,
        ...(input.subjectRef === undefined ? {} : { subjectRef: input.subjectRef }),
        predicate: input.predicate,
        object: input.object,
        confidence: input.confidence,
        reviewState: "proposed"
      }
    };
    const appended = await this.dependencies.ledger.append(event, {
      expectedGlobalEventCount: events.length
    });

    if (appended.type !== "assertion.proposed") {
      throw new Error("Unexpected event type appended for evidence assertion preparation.");
    }

    return preparedCandidate(appended, evidence, eligibility.provenanceEventIds);
  }
}

export function evaluateEvidenceProposalEligibility(
  events: readonly KnowledgeEvent[],
  evidenceId: string
): EvidenceProposalEligibility {
  const evidence = events.find(
    (event): event is KnowledgeEventOf<"evidence.ingested"> =>
      event.type === "evidence.ingested" && event.payload.evidenceId === evidenceId
  );
  const links = events.filter(
    (event): event is KnowledgeEventOf<"ingestion.evidence.linked"> =>
      event.type === "ingestion.evidence.linked" && event.payload.evidenceId === evidenceId
  );
  const reasons = new Set<string>();
  const provenanceEventIds = new Set<string>();

  if (evidence === undefined) {
    reasons.add("Evidence ingestion provenance is missing.");
  } else {
    provenanceEventIds.add(evidence.id);
  }
  if (links.length === 0) {
    reasons.add("Evidence occurrence lineage is missing.");
  }

  for (const link of links) {
    provenanceEventIds.add(link.id);
    if (evidence !== undefined && link.payload.contentHash !== evidence.payload.contentHash) {
      reasons.add("Evidence content hash does not match ingestion lineage.");
    }

    const source = events.find(
      (event): event is KnowledgeEventOf<"ingestion.source.registered"> =>
        event.type === "ingestion.source.registered" &&
        event.payload.sourceCollectionId === link.payload.sourceCollectionId
    );
    if (source === undefined) {
      reasons.add("Evidence source collection provenance is missing.");
    } else {
      provenanceEventIds.add(source.id);
    }

    const approval = events.find(
      (event): event is KnowledgeEventOf<"ingestion.import.approved"> =>
        event.type === "ingestion.import.approved" &&
        event.payload.importBatchId === link.payload.importBatchId &&
        event.payload.sourceCollectionId === link.payload.sourceCollectionId &&
        event.context.actor.kind === "human" &&
        event.payload.approvedBy === event.context.actor.id
    );
    if (approval === undefined) {
      reasons.add("Human import approval provenance is missing.");
    } else {
      provenanceEventIds.add(approval.id);
    }

    const completion = events.find(
      (event): event is KnowledgeEventOf<"ingestion.import.completed"> =>
        event.type === "ingestion.import.completed" &&
        event.payload.importBatchId === link.payload.importBatchId &&
        event.payload.sourceCollectionId === link.payload.sourceCollectionId
    );
    if (completion === undefined) {
      reasons.add("Evidence import completion provenance is missing.");
    } else {
      provenanceEventIds.add(completion.id);
    }

    for (const occurrenceId of link.payload.occurrenceIds) {
      const occurrence = events.find(
        (event): event is KnowledgeEventOf<"ingestion.occurrence.observed"> =>
          event.type === "ingestion.occurrence.observed" && event.payload.occurrenceId === occurrenceId
      );
      if (occurrence === undefined) {
        reasons.add("A linked source occurrence is missing.");
        continue;
      }
      provenanceEventIds.add(occurrence.id);
      if (
        occurrence.payload.sourceCollectionId !== link.payload.sourceCollectionId ||
        occurrence.payload.contentHash !== link.payload.contentHash ||
        (completion !== undefined && occurrence.payload.scanBatchId !== completion.payload.scanBatchId)
      ) {
        reasons.add("A linked source occurrence does not match its import provenance.");
      }
    }
  }

  const governance = buildGovernanceProjection(events).evidenceGovernance.get(evidenceId);
  const provenanceComplete = reasons.size === 0;
  if (governance?.quarantined === true) {
    reasons.add("Quarantined evidence is excluded from ordinary assertion preparation.");
  }
  if (governance?.tombstoned === true) {
    reasons.add("Tombstoned evidence is excluded from ordinary assertion preparation.");
  }

  return Object.freeze({
    ...(evidence === undefined ? {} : { evidence }),
    provenanceEventIds: Object.freeze([...provenanceEventIds].sort(compareCodeUnits)),
    provenanceComplete,
    selectable: reasons.size === 0,
    blockingReasons: Object.freeze([...reasons])
  });
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sameAssertionProposal(
  event: KnowledgeEventOf<"assertion.proposed">,
  input: EvidenceAssertionCandidateInput
): boolean {
  return event.payload.evidenceId === input.evidenceId &&
    event.payload.subjectRef === input.subjectRef &&
    event.payload.predicate === input.predicate &&
    Object.is(event.payload.object, input.object) &&
    event.payload.confidence === input.confidence;
}

function preparedCandidate(
  event: KnowledgeEventOf<"assertion.proposed">,
  evidence: KnowledgeEventOf<"evidence.ingested">,
  provenanceEventIds: readonly string[]
): PreparedEvidenceAssertionCandidate {
  return Object.freeze({
    assertionId: event.payload.assertionId,
    evidenceReferences: Object.freeze([Object.freeze({
      evidenceId: event.payload.evidenceId,
      contentHash: evidence.payload.contentHash,
      eventIds: Object.freeze([...provenanceEventIds])
    })]),
    reviewState: "proposed",
    reviewRequired: true,
    event
  });
}
