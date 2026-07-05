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

export interface EnableNetworkExposureInput {
  exposureId: string;
  mode: "lan" | "tailnet";
  bindScope: "lan" | "tailnet";
  enabledBy: string;
  policy: PolicyRef;
}

export interface ApproveDeviceSessionInput {
  sessionId: string;
  deviceLabel: string;
  approvedBy: string;
  exposureId: string;
  capabilities: readonly ("read" | "write")[];
  policy: PolicyRef;
}

type IncidentSeverity = "info" | "warning" | "error" | "critical";
type IncidentCategory = "classification" | "secret-leak" | "export" | "network" | "device" | "quarantine" | "projection";

export interface RecordIncidentInput {
  incidentId: string;
  severity: IncidentSeverity;
  category: IncidentCategory;
  recordedBy: string;
  summary: string;
  relatedEvidenceIds: readonly string[];
  relatedEventIds: readonly string[];
}

export interface RecordIncidentRepairInput {
  incidentId: string;
  repairId: string;
  severity: IncidentSeverity;
  category: IncidentCategory;
  repairedBy: string;
  action: string;
  relatedEvidenceIds: readonly string[];
  relatedEventIds: readonly string[];
  closesIncident: boolean;
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

  async enableNetworkExposure(input: EnableNetworkExposureInput): Promise<KnowledgeEventOf<"network.exposure.enabled">> {
    this.assertHumanActor("Network exposure");

    if (input.enabledBy !== this.actor.id) {
      throw new Error("Network exposure enabledBy must match the service actor");
    }

    const streamId = `network_exposure_${input.exposureId}`;
    const streamEvents = await this.dependencies.ledger.readStream(streamId);
    const event: AppendableKnowledgeEvent<"network.exposure.enabled"> = {
      type: "network.exposure.enabled",
      version: 1,
      streamId,
      context: this.context(`corr_network_exposure_${input.exposureId}`),
      payload: {
        exposureId: input.exposureId,
        mode: input.mode,
        bindScope: input.bindScope,
        enabledBy: input.enabledBy,
        enabledAt: new Date().toISOString(),
        visibleWarning: true,
        policy: input.policy
      }
    };

    const appended = await this.dependencies.ledger.append(event, {
      expectedNextSequence: streamEvents.length + 1
    });

    if (appended.type !== "network.exposure.enabled") {
      throw new Error(`Unexpected event type appended for network exposure: ${appended.type}`);
    }

    return appended;
  }

  async approveDeviceSession(input: ApproveDeviceSessionInput): Promise<KnowledgeEventOf<"device.session.approved">> {
    this.assertHumanActor("Device session approval");

    if (input.approvedBy !== this.actor.id) {
      throw new Error("Device session approvedBy must match the service actor");
    }

    const deviceLabel = assertSecretSafeText(input.deviceLabel);
    const activeExposure = await this.findActiveNetworkExposure(input.exposureId);
    const event: AppendableKnowledgeEvent<"device.session.approved"> = {
      type: "device.session.approved",
      version: 1,
      streamId: `device_session_${input.sessionId}`,
      context: this.context(`corr_device_session_${input.sessionId}`, activeExposure.id),
      payload: {
        sessionId: input.sessionId,
        deviceLabel,
        approvedBy: input.approvedBy,
        approvedAt: new Date().toISOString(),
        exposureId: input.exposureId,
        capabilities: [...input.capabilities],
        policy: input.policy
      }
    };

    const appended = await this.dependencies.ledger.append(event, {
      expectedNextSequence: 1
    });

    if (appended.type !== "device.session.approved") {
      throw new Error(`Unexpected event type appended for device session approval: ${appended.type}`);
    }

    return appended;
  }

  async recordIncident(input: RecordIncidentInput): Promise<KnowledgeEventOf<"incident.recorded">> {
    if (input.recordedBy !== this.actor.id) {
      throw new Error("Incident recordedBy must match the service actor");
    }

    const streamId = this.incidentStreamId(input.incidentId);
    const streamEvents = await this.dependencies.ledger.readStream(streamId);
    const event: AppendableKnowledgeEvent<"incident.recorded"> = {
      type: "incident.recorded",
      version: 1,
      streamId,
      context: this.context(
        `corr_incident_${input.incidentId}`,
        input.relatedEventIds.length === 0 ? undefined : input.relatedEventIds[input.relatedEventIds.length - 1]
      ),
      payload: {
        incidentId: input.incidentId,
        severity: input.severity,
        category: input.category,
        recordedBy: input.recordedBy,
        summary: assertSecretSafeText(input.summary),
        relatedEvidenceIds: [...input.relatedEvidenceIds],
        relatedEventIds: [...input.relatedEventIds]
      }
    };

    const appended = await this.dependencies.ledger.append(event, {
      expectedNextSequence: streamEvents.length + 1
    });

    if (appended.type !== "incident.recorded") {
      throw new Error(`Unexpected event type appended for incident recording: ${appended.type}`);
    }

    return appended;
  }

  async recordIncidentRepair(input: RecordIncidentRepairInput): Promise<KnowledgeEventOf<"incident.repair.recorded">> {
    if (input.repairedBy !== this.actor.id) {
      throw new Error("Incident repair repairedBy must match the service actor");
    }

    if (input.closesIncident) {
      this.assertHumanActor("Incident repair closure");
    }

    const streamId = this.incidentStreamId(input.incidentId);
    const streamEvents = await this.dependencies.ledger.readStream(streamId);
    const incident = streamEvents.find(
      (event): event is KnowledgeEventOf<"incident.recorded"> =>
        event.type === "incident.recorded" && event.payload.incidentId === input.incidentId
    );

    if (incident === undefined) {
      throw new Error(`Cannot record repair for missing incident ${input.incidentId}`);
    }

    const causation =
      streamEvents.findLast(
        (event): event is KnowledgeEventOf<"incident.repair.recorded"> =>
          event.type === "incident.repair.recorded" && event.payload.incidentId === input.incidentId
      ) ?? incident;

    const event: AppendableKnowledgeEvent<"incident.repair.recorded"> = {
      type: "incident.repair.recorded",
      version: 1,
      streamId,
      context: this.context(causation.context.correlationId, causation.id),
      payload: {
        incidentId: input.incidentId,
        repairId: input.repairId,
        severity: input.severity,
        category: input.category,
        repairedBy: input.repairedBy,
        repairedAt: new Date().toISOString(),
        action: assertSecretSafeText(input.action),
        relatedEvidenceIds: [...input.relatedEvidenceIds],
        relatedEventIds: [...input.relatedEventIds],
        closesIncident: input.closesIncident
      }
    };

    const appended = await this.dependencies.ledger.append(event, {
      expectedNextSequence: streamEvents.length + 1
    });

    if (appended.type !== "incident.repair.recorded") {
      throw new Error(`Unexpected event type appended for incident repair: ${appended.type}`);
    }

    return appended;
  }

  private async findActiveNetworkExposure(
    exposureId: string
  ): Promise<KnowledgeEventOf<"network.exposure.enabled">> {
    const streamEvents = await this.dependencies.ledger.readStream(`network_exposure_${exposureId}`);
    const latestExposureEvent = streamEvents.findLast(
      (
        event
      ): event is KnowledgeEventOf<"network.exposure.enabled"> | KnowledgeEventOf<"network.exposure.disabled"> =>
        (event.type === "network.exposure.enabled" || event.type === "network.exposure.disabled") &&
        event.payload.exposureId === exposureId
    );

    if (latestExposureEvent?.type !== "network.exposure.enabled") {
      throw new Error(`Cannot approve device session without an active network exposure ${exposureId}`);
    }

    return latestExposureEvent;
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

  private incidentStreamId(incidentId: string): string {
    return `incident_${incidentId}`;
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

  private assertHumanActor(action: string): void {
    if (this.actor.kind !== "human") {
      throw new Error(`${action} requires a human service actor`);
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
