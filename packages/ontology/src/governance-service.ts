import type { z } from "zod";
import { actorRefSchema, type AppendableKnowledgeEvent, type KnowledgeEventOf } from "./contracts.js";
import type { EventLedger } from "./event-ledger.js";
import { assertSecretSafeText, type GovernanceTag } from "./governance-policy.js";
import { buildGovernanceProjection } from "./governance-projection.js";

type ActorRef = z.infer<typeof actorRefSchema>;
type PolicyRef = { policyId: string; version: string };

export interface GovernanceServiceDependencies {
  ledger: EventLedger;
  actor: ActorRef;
}

export interface ClassifyEvidenceInput {
  evidenceId: string;
  policy: PolicyRef;
  classifier: {
    actorId: string;
    kind: "ai" | "human" | "system" | "ruleset";
    label: string;
    model?: string;
    tool?: string;
  };
  tags: Array<{ tag: GovernanceTag; confidence: number; rationale: string }>;
}

export interface ReviewEvidenceGovernanceInput {
  evidenceId: string;
  reviewedBy: string;
  policy: PolicyRef;
  decisions: Array<{
    tag: GovernanceTag;
    action: "affirm" | "add" | "remove" | "supersede";
    rationale: string;
    supersedesEventId?: string;
  }>;
}

export interface RecordGeneratedArtifactInput {
  policy: PolicyRef;
  includedEvidenceIds: readonly string[];
  includedContentHashes: readonly `sha256:${string}`[];
  sensitiveOptIns: readonly { tag: GovernanceTag; approvedBy: string; rationale: string }[];
  defaultPublicSafeOnly: boolean;
  causationId?: string;
}

export interface RecordExportGeneratedInput extends RecordGeneratedArtifactInput {
  exportId: string;
}

export interface RecordReportGeneratedInput extends RecordGeneratedArtifactInput {
  reportId: string;
}

export class GovernanceService {
  private readonly actor: ActorRef;

  constructor(private readonly dependencies: GovernanceServiceDependencies) {
    const actor = actorRefSchema.safeParse(dependencies.actor);

    if (!actor.success) {
      throw new Error(`Invalid governance actor: ${actor.error.message}`);
    }

    this.actor = actor.data;
  }

  async classifyEvidence(input: ClassifyEvidenceInput): Promise<KnowledgeEventOf<"evidence.governance.classified">> {
    if (input.classifier.actorId !== this.actor.id) {
      throw new Error("Governance classifier actorId must match the service actor");
    }

    const streamEvents = await this.dependencies.ledger.readStream(this.evidenceStreamId(input.evidenceId));
    const evidence = this.findIngestedEvidence(input.evidenceId, streamEvents);

    if (evidence === undefined) {
      throw new Error(`Cannot classify evidence ${input.evidenceId} without evidence.ingested`);
    }

    const event: AppendableKnowledgeEvent<"evidence.governance.classified"> = {
      type: "evidence.governance.classified",
      version: 1,
      streamId: this.evidenceStreamId(input.evidenceId),
      context: this.context(`corr_governance_${input.evidenceId}`, evidence.id),
      payload: {
        evidenceId: input.evidenceId,
        evidenceEventId: evidence.id,
        contentHash: evidence.payload.contentHash,
        policy: input.policy,
        classifier: {
          actorId: input.classifier.actorId,
          kind: input.classifier.kind,
          label: assertSecretSafeText(input.classifier.label),
          ...(input.classifier.model === undefined
            ? {}
            : { model: assertSecretSafeText(input.classifier.model) }),
          ...(input.classifier.tool === undefined ? {} : { tool: assertSecretSafeText(input.classifier.tool) })
        },
        tags: input.tags.map((tag) => ({
          tag: tag.tag,
          confidence: tag.confidence,
          rationale: assertSecretSafeText(tag.rationale)
        }))
      }
    };

    const appended = await this.dependencies.ledger.append(event, {
      expectedNextSequence: streamEvents.length + 1
    });

    if (appended.type !== "evidence.governance.classified") {
      throw new Error(`Unexpected event type appended for governance classification: ${appended.type}`);
    }

    return appended;
  }

  async reviewEvidenceGovernance(
    input: ReviewEvidenceGovernanceInput
  ): Promise<KnowledgeEventOf<"evidence.governance.reviewed">> {
    if (this.actor.kind !== "human") {
      throw new Error("Governance review requires a human service actor");
    }

    if (input.reviewedBy !== this.actor.id) {
      throw new Error("Governance reviewedBy must match the service actor");
    }

    const streamEvents = await this.dependencies.ledger.readStream(this.evidenceStreamId(input.evidenceId));
    const causation = streamEvents.findLast(
      (event) => event.type === "evidence.governance.classified" || event.type === "evidence.governance.reviewed"
    );

    if (causation === undefined) {
      throw new Error(`Cannot review evidence ${input.evidenceId} without governance classification`);
    }

    const governanceEventIds = new Set(
      streamEvents
        .filter((event) => event.type === "evidence.governance.classified" || event.type === "evidence.governance.reviewed")
        .map((event) => event.id)
    );
    if (
      input.decisions.some(
        (decision) => decision.supersedesEventId !== undefined && !governanceEventIds.has(decision.supersedesEventId)
      )
    ) {
      throw new Error("Governance supersedesEventId must reference an earlier governance event in the evidence stream");
    }

    const event: AppendableKnowledgeEvent<"evidence.governance.reviewed"> = {
      type: "evidence.governance.reviewed",
      version: 1,
      streamId: this.evidenceStreamId(input.evidenceId),
      context: this.context(causation.context.correlationId, causation.id),
      payload: {
        evidenceId: input.evidenceId,
        reviewedBy: input.reviewedBy,
        policy: input.policy,
        decisions: input.decisions.map((decision) => ({
          tag: decision.tag,
          action: decision.action,
          rationale: assertSecretSafeText(decision.rationale),
          ...(decision.supersedesEventId === undefined ? {} : { supersedesEventId: decision.supersedesEventId })
        }))
      }
    };

    const appended = await this.dependencies.ledger.append(event, {
      expectedNextSequence: streamEvents.length + 1
    });

    if (appended.type !== "evidence.governance.reviewed") {
      throw new Error(`Unexpected event type appended for governance review: ${appended.type}`);
    }

    return appended;
  }

  async recordExportGenerated(input: RecordExportGeneratedInput): Promise<KnowledgeEventOf<"export.generated">> {
    await this.assertGeneratedArtifactAllowed(input);

    const event: AppendableKnowledgeEvent<"export.generated"> = {
      type: "export.generated",
      version: 1,
      streamId: `export_${input.exportId}`,
      context: this.context(`corr_${input.exportId}`, input.causationId),
      payload: {
        exportId: input.exportId,
        generatedBy: this.actor.id,
        generatedAt: new Date().toISOString(),
        policy: input.policy,
        includedEvidenceIds: [...input.includedEvidenceIds],
        includedContentHashes: [...input.includedContentHashes],
        sensitiveOptIns: input.sensitiveOptIns.map((optIn) => ({
          tag: optIn.tag,
          approvedBy: optIn.approvedBy,
          rationale: assertSecretSafeText(optIn.rationale)
        })),
        defaultPublicSafeOnly: input.defaultPublicSafeOnly
      }
    };

    const appended = await this.dependencies.ledger.append(event, {
      expectedNextSequence: 1
    });

    if (appended.type !== "export.generated") {
      throw new Error(`Unexpected event type appended for generated export: ${appended.type}`);
    }

    return appended;
  }

  async recordReportGenerated(input: RecordReportGeneratedInput): Promise<KnowledgeEventOf<"report.generated">> {
    await this.assertGeneratedArtifactAllowed(input);

    const event: AppendableKnowledgeEvent<"report.generated"> = {
      type: "report.generated",
      version: 1,
      streamId: `report_${input.reportId}`,
      context: this.context(`corr_${input.reportId}`, input.causationId),
      payload: {
        reportId: input.reportId,
        generatedBy: this.actor.id,
        generatedAt: new Date().toISOString(),
        policy: input.policy,
        includedEvidenceIds: [...input.includedEvidenceIds],
        includedContentHashes: [...input.includedContentHashes],
        sensitiveOptIns: input.sensitiveOptIns.map((optIn) => ({
          tag: optIn.tag,
          approvedBy: optIn.approvedBy,
          rationale: assertSecretSafeText(optIn.rationale)
        })),
        defaultPublicSafeOnly: input.defaultPublicSafeOnly
      }
    };

    const appended = await this.dependencies.ledger.append(event, {
      expectedNextSequence: 1
    });

    if (appended.type !== "report.generated") {
      throw new Error(`Unexpected event type appended for generated report: ${appended.type}`);
    }

    return appended;
  }

  private findIngestedEvidence(
    evidenceId: string,
    streamEvents: Awaited<ReturnType<EventLedger["readStream"]>>
  ): KnowledgeEventOf<"evidence.ingested"> | undefined {
    return streamEvents.find(
      (event): event is KnowledgeEventOf<"evidence.ingested"> =>
        event.type === "evidence.ingested" && event.payload.evidenceId === evidenceId
    );
  }

  private evidenceStreamId(evidenceId: string): string {
    return `evidence_${evidenceId}`;
  }

  private async assertGeneratedArtifactAllowed(input: RecordGeneratedArtifactInput): Promise<void> {
    if (input.sensitiveOptIns.length > 0 && this.actor.kind !== "human") {
      throw new Error("Sensitive export and report opt-ins require a human service actor");
    }

    for (const optIn of input.sensitiveOptIns) {
      if (optIn.approvedBy !== this.actor.id) {
        throw new Error("Sensitive opt-in approvedBy must match the service actor");
      }

      assertSecretSafeText(optIn.rationale);
    }

    const projection = buildGovernanceProjection(await this.dependencies.ledger.readAll());
    const plan = projection.planExport({
      requestedEvidenceIds: input.includedEvidenceIds,
      sensitiveOptInTags: input.sensitiveOptIns.map((optIn) => optIn.tag)
    });

    if (plan.blockedEvidence.length > 0 || !sameSortedValues(plan.includedEvidenceIds, input.includedEvidenceIds)) {
      throw new Error("Cannot generate export or report outside the governed export plan");
    }
  }

  private context(correlationId: string, causationId?: string): AppendableKnowledgeEvent["context"] {
    return {
      actor: this.actor,
      occurredAt: new Date().toISOString(),
      ...(causationId === undefined ? {} : { causationId }),
      correlationId,
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0" }
    };
  }
}

function sameSortedValues(left: readonly string[], right: readonly string[]): boolean {
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();

  return sortedLeft.length === sortedRight.length && sortedLeft.every((value, index) => value === sortedRight[index]);
}
