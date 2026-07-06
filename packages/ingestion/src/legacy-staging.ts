import { createHash } from "node:crypto";
import type { z } from "zod";
import { AssertionService } from "../../ontology/src/assertion-service.js";
import {
  actorRefSchema,
  type AppendableKnowledgeEvent,
  type KnowledgeEventOf
} from "../../ontology/src/contracts.js";
import type { EventLedger } from "../../ontology/src/event-ledger.js";

type ActorRef = z.infer<typeof actorRefSchema>;
type AssertionObject = string | number | boolean | null;

export interface LegacyOntologyStagingServiceDependencies {
  ledger: EventLedger;
  actor: ActorRef;
}

export interface ApproveLegacyStagingInput {
  sourceCollectionId: string;
  scanBatchId: string;
  stagingBatchId: string;
  legacyReportId: string;
  reportHash: `sha256:${string}`;
  candidateSetHash: `sha256:${string}`;
  approvedBy: string;
  approvedAssertionCandidateIds: string[];
}

export interface LegacyApprovedAssertionCandidate {
  candidateId: string;
  evidenceId: string;
  predicate: string;
  object: AssertionObject;
  confidence: number;
  subjectRef?: string;
}

export interface StageApprovedLegacyAssertionsInput
  extends Omit<ApproveLegacyStagingInput, "approvedBy" | "approvedAssertionCandidateIds"> {
  candidates: LegacyApprovedAssertionCandidate[];
}

export class LegacyOntologyStagingService {
  private readonly assertions: AssertionService;
  private readonly actor: ActorRef;
  private readonly ledger: EventLedger;

  constructor(dependencies: LegacyOntologyStagingServiceDependencies) {
    const actor = actorRefSchema.safeParse(dependencies.actor);

    if (!actor.success) {
      const issue = actor.error.issues[0];
      throw new Error(`Invalid legacy ontology staging actor: ${issue?.message ?? actor.error.message}`);
    }

    this.actor = actor.data;
    this.ledger = dependencies.ledger;
    this.assertions = new AssertionService({ ledger: dependencies.ledger });
  }

  async approveStaging(input: ApproveLegacyStagingInput): Promise<KnowledgeEventOf<"legacy.ontology.staging.approved">> {
    const approvedAt = new Date().toISOString();
    const event: AppendableKnowledgeEvent<"legacy.ontology.staging.approved"> = {
      type: "legacy.ontology.staging.approved",
      version: 1,
      streamId: stagingStreamId(input),
      context: {
        actor: this.actor,
        occurredAt: approvedAt,
        correlationId: `corr_${input.stagingBatchId}`,
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0", ingestion: "0.1.0", legacy: "0.1.0" }
      },
      payload: {
        stagingBatchId: input.stagingBatchId,
        legacyReportId: input.legacyReportId,
        sourceCollectionId: input.sourceCollectionId,
        scanBatchId: input.scanBatchId,
        reportHash: input.reportHash,
        candidateSetHash: input.candidateSetHash,
        approvedBy: input.approvedBy,
        approvedAt,
        approvedAssertionCandidateIds: input.approvedAssertionCandidateIds
      }
    };

    const appended = await this.ledger.append(event, { expectedNextSequence: 1 });

    if (appended.type !== "legacy.ontology.staging.approved") {
      throw new Error(`Unexpected event type appended for legacy staging approval: ${appended.type}`);
    }

    return appended;
  }

  async stageApprovedAssertions(
    input: StageApprovedLegacyAssertionsInput
  ): Promise<Array<KnowledgeEventOf<"assertion.proposed">>> {
    const approval = await this.findApproval(input);

    if (approval === undefined) {
      throw new Error(`Legacy ontology staging approval is required before ${input.stagingBatchId}`);
    }

    const approvedIds = new Set(approval.payload.approvedAssertionCandidateIds);
    const approvedCandidates = input.candidates.filter((candidate) => approvedIds.has(candidate.candidateId));
    const proposed: Array<KnowledgeEventOf<"assertion.proposed">> = [];

    await this.preflightEvidence(input.stagingBatchId, approvedCandidates);

    for (const candidate of approvedCandidates) {
      proposed.push(
        await this.assertions.propose({
          assertionId: legacyAssertionId(input.stagingBatchId, candidate.candidateId),
          evidenceId: candidate.evidenceId,
          ...(candidate.subjectRef === undefined ? {} : { subjectRef: candidate.subjectRef }),
          predicate: candidate.predicate,
          object: candidate.object,
          confidence: candidate.confidence,
          actor: this.actor
        })
      );
    }

    return proposed;
  }

  private async preflightEvidence(
    stagingBatchId: string,
    candidates: readonly LegacyApprovedAssertionCandidate[]
  ): Promise<void> {
    for (const candidate of candidates) {
      const evidenceEvents = await this.ledger.readStream(`evidence_${candidate.evidenceId}`);
      const ingested = evidenceEvents.some(
        (event) => event.type === "evidence.ingested" && event.payload.evidenceId === candidate.evidenceId
      );

      if (!ingested) {
        throw new Error(
          `Cannot propose assertion ${legacyAssertionId(stagingBatchId, candidate.candidateId)} without evidence ${candidate.evidenceId}`
        );
      }
    }
  }

  private async findApproval(
    input: Pick<
      ApproveLegacyStagingInput,
      "sourceCollectionId" | "scanBatchId" | "stagingBatchId" | "legacyReportId" | "reportHash" | "candidateSetHash"
    >
  ): Promise<KnowledgeEventOf<"legacy.ontology.staging.approved"> | undefined> {
    const events = await this.ledger.readStream(stagingStreamId(input));

    return events.find(
      (event): event is KnowledgeEventOf<"legacy.ontology.staging.approved"> =>
        event.type === "legacy.ontology.staging.approved" &&
        event.payload.legacyReportId === input.legacyReportId &&
        event.payload.reportHash === input.reportHash &&
        event.payload.candidateSetHash === input.candidateSetHash
    );
  }
}

function stagingStreamId(
  input: Pick<ApproveLegacyStagingInput, "sourceCollectionId" | "scanBatchId" | "stagingBatchId">
): string {
  return `legacy_staging_${input.sourceCollectionId}_${input.scanBatchId}_${input.stagingBatchId}`;
}

function legacyAssertionId(stagingBatchId: string, candidateId: string): string {
  return `as_legacy_${createHash("sha256").update(`${stagingBatchId}:${candidateId}`).digest("hex")}`;
}
