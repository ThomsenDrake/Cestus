import type { z } from "zod";
import { actorRefSchema, type AppendableKnowledgeEvent, type KnowledgeEventOf } from "./contracts.js";
import type { EventLedger } from "./event-ledger.js";
import { assertSecretSafeText, validateGovernancePolicy, type GovernancePolicy, type GovernanceTag } from "./governance-policy.js";
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

export interface InstallPolicyInput {
  policy: GovernancePolicy;
  installedBy: string;
  causationId?: string;
}

export interface ApplyEvidenceRedactionInput {
  evidenceId: string;
  redactionId: string;
  appliedBy: string;
  rationale: string;
  redactedContentHash?: `sha256:${string}`;
}

export interface QuarantineEvidenceInput {
  evidenceId: string;
  quarantineId: string;
  quarantinedBy: string;
  reason: string;
  lockLevel: "workflow" | "export" | "all";
}

export interface TombstoneEvidenceInput {
  evidenceId: string;
  tombstoneId: string;
  tombstonedBy: string;
  reason: string;
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

export interface DisableNetworkExposureInput {
  exposureId: string;
  disabledBy: string;
  reason: string;
}

export interface ApproveDeviceSessionInput {
  sessionId: string;
  deviceLabel: string;
  approvedBy: string;
  exposureId: string;
  capabilities: readonly ("read" | "write")[];
  policy: PolicyRef;
}

export interface RevokeDeviceSessionInput {
  sessionId: string;
  revokedBy: string;
  reason: string;
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

  async installPolicy(input: InstallPolicyInput): Promise<KnowledgeEventOf<"governance.policy.installed">> {
    this.assertHumanActor("Governance policy installation");

    if (input.installedBy !== this.actor.id) {
      throw new Error("Governance policy installedBy must match the service actor");
    }

    const policy = validateGovernancePolicy(input.policy);
    const streamId = `governance_policy_${policy.policyId}`;
    const streamEvents = await this.dependencies.ledger.readStream(streamId);
    const event: AppendableKnowledgeEvent<"governance.policy.installed"> = {
      type: "governance.policy.installed",
      version: 1,
      streamId,
      context: this.context(`corr_governance_policy_${policy.policyId}`, input.causationId),
      payload: {
        policyId: policy.policyId,
        version: policy.version,
        installedBy: input.installedBy,
        confidenceThreshold: policy.confidenceThreshold,
        tags: policy.tags.map((tag) => ({ ...tag }))
      }
    };

    const appended = await this.dependencies.ledger.append(event, {
      expectedNextSequence: streamEvents.length + 1
    });

    if (appended.type !== "governance.policy.installed") {
      throw new Error(`Unexpected event type appended for governance policy installation: ${appended.type}`);
    }

    return appended;
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

  async applyEvidenceRedaction(
    input: ApplyEvidenceRedactionInput
  ): Promise<KnowledgeEventOf<"evidence.redaction.applied">> {
    this.assertHumanActor("Evidence redaction");

    if (input.appliedBy !== this.actor.id) {
      throw new Error("Evidence redaction appliedBy must match the service actor");
    }

    const streamEvents = await this.dependencies.ledger.readStream(this.evidenceStreamId(input.evidenceId));
    const causation = this.findLatestEvidenceCausation(input.evidenceId, streamEvents);
    const event: AppendableKnowledgeEvent<"evidence.redaction.applied"> = {
      type: "evidence.redaction.applied",
      version: 1,
      streamId: this.evidenceStreamId(input.evidenceId),
      context: this.context(causation.context.correlationId, causation.id),
      payload: {
        evidenceId: input.evidenceId,
        redactionId: input.redactionId,
        appliedBy: input.appliedBy,
        rationale: assertSecretSafeText(input.rationale),
        ...(input.redactedContentHash === undefined ? {} : { redactedContentHash: input.redactedContentHash })
      }
    };

    const appended = await this.dependencies.ledger.append(event, {
      expectedNextSequence: streamEvents.length + 1
    });

    if (appended.type !== "evidence.redaction.applied") {
      throw new Error(`Unexpected event type appended for evidence redaction: ${appended.type}`);
    }

    return appended;
  }

  async quarantineEvidence(input: QuarantineEvidenceInput): Promise<KnowledgeEventOf<"evidence.quarantined">> {
    this.assertHumanActor("Evidence quarantine");

    if (input.quarantinedBy !== this.actor.id) {
      throw new Error("Evidence quarantine quarantinedBy must match the service actor");
    }

    const streamEvents = await this.dependencies.ledger.readStream(this.evidenceStreamId(input.evidenceId));
    const causation = this.findLatestEvidenceCausation(input.evidenceId, streamEvents);
    const event: AppendableKnowledgeEvent<"evidence.quarantined"> = {
      type: "evidence.quarantined",
      version: 1,
      streamId: this.evidenceStreamId(input.evidenceId),
      context: this.context(causation.context.correlationId, causation.id),
      payload: {
        evidenceId: input.evidenceId,
        quarantineId: input.quarantineId,
        quarantinedBy: input.quarantinedBy,
        reason: assertSecretSafeText(input.reason),
        lockLevel: input.lockLevel
      }
    };

    const appended = await this.dependencies.ledger.append(event, {
      expectedNextSequence: streamEvents.length + 1
    });

    if (appended.type !== "evidence.quarantined") {
      throw new Error(`Unexpected event type appended for evidence quarantine: ${appended.type}`);
    }

    return appended;
  }

  async tombstoneEvidence(input: TombstoneEvidenceInput): Promise<KnowledgeEventOf<"evidence.tombstoned">> {
    this.assertHumanActor("Evidence tombstone");

    if (input.tombstonedBy !== this.actor.id) {
      throw new Error("Evidence tombstone tombstonedBy must match the service actor");
    }

    const streamEvents = await this.dependencies.ledger.readStream(this.evidenceStreamId(input.evidenceId));
    const causation = this.findLatestEvidenceCausation(input.evidenceId, streamEvents);
    const event: AppendableKnowledgeEvent<"evidence.tombstoned"> = {
      type: "evidence.tombstoned",
      version: 1,
      streamId: this.evidenceStreamId(input.evidenceId),
      context: this.context(causation.context.correlationId, causation.id),
      payload: {
        evidenceId: input.evidenceId,
        tombstoneId: input.tombstoneId,
        tombstonedBy: input.tombstonedBy,
        reason: assertSecretSafeText(input.reason)
      }
    };

    const appended = await this.dependencies.ledger.append(event, {
      expectedNextSequence: streamEvents.length + 1
    });

    if (appended.type !== "evidence.tombstoned") {
      throw new Error(`Unexpected event type appended for evidence tombstone: ${appended.type}`);
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

  async disableNetworkExposure(
    input: DisableNetworkExposureInput
  ): Promise<KnowledgeEventOf<"network.exposure.disabled">> {
    this.assertHumanActor("Network exposure disable");

    if (input.disabledBy !== this.actor.id) {
      throw new Error("Network exposure disabledBy must match the service actor");
    }

    const streamId = `network_exposure_${input.exposureId}`;
    const streamEvents = await this.dependencies.ledger.readStream(streamId);
    const activeExposure = this.findLatestNetworkExposure(input.exposureId, streamEvents);
    if (activeExposure?.type !== "network.exposure.enabled") {
      throw new Error(`Cannot disable network exposure without an active network exposure ${input.exposureId}`);
    }
    const event: AppendableKnowledgeEvent<"network.exposure.disabled"> = {
      type: "network.exposure.disabled",
      version: 1,
      streamId,
      context: this.context(activeExposure.context.correlationId, activeExposure.id),
      payload: {
        exposureId: input.exposureId,
        disabledBy: input.disabledBy,
        disabledAt: new Date().toISOString(),
        reason: assertSecretSafeText(input.reason)
      }
    };

    const appended = await this.dependencies.ledger.append(event, {
      expectedNextSequence: streamEvents.length + 1
    });

    if (appended.type !== "network.exposure.disabled") {
      throw new Error(`Unexpected event type appended for network exposure disable: ${appended.type}`);
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
    const streamEvents = await this.dependencies.ledger.readStream(`device_session_${input.sessionId}`);
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
      expectedNextSequence: streamEvents.length + 1
    });

    if (appended.type !== "device.session.approved") {
      throw new Error(`Unexpected event type appended for device session approval: ${appended.type}`);
    }

    return appended;
  }

  async revokeDeviceSession(input: RevokeDeviceSessionInput): Promise<KnowledgeEventOf<"device.session.revoked">> {
    this.assertHumanActor("Device session revocation");

    if (input.revokedBy !== this.actor.id) {
      throw new Error("Device session revokedBy must match the service actor");
    }

    const streamId = `device_session_${input.sessionId}`;
    const streamEvents = await this.dependencies.ledger.readStream(streamId);
    const latestSessionEvent = streamEvents.findLast(
      (
        event
      ): event is KnowledgeEventOf<"device.session.approved"> | KnowledgeEventOf<"device.session.revoked"> =>
        (event.type === "device.session.approved" || event.type === "device.session.revoked") &&
        event.payload.sessionId === input.sessionId
    );

    if (latestSessionEvent?.type !== "device.session.approved") {
      throw new Error(`Cannot revoke missing or already revoked device session ${input.sessionId}`);
    }

    const event: AppendableKnowledgeEvent<"device.session.revoked"> = {
      type: "device.session.revoked",
      version: 1,
      streamId,
      context: this.context(latestSessionEvent.context.correlationId, latestSessionEvent.id),
      payload: {
        sessionId: input.sessionId,
        revokedBy: input.revokedBy,
        revokedAt: new Date().toISOString(),
        reason: assertSecretSafeText(input.reason)
      }
    };

    const appended = await this.dependencies.ledger.append(event, {
      expectedNextSequence: streamEvents.length + 1
    });

    if (appended.type !== "device.session.revoked") {
      throw new Error(`Unexpected event type appended for device session revocation: ${appended.type}`);
    }

    return appended;
  }

  async recordIncident(input: RecordIncidentInput): Promise<KnowledgeEventOf<"incident.recorded">> {
    if (input.recordedBy !== this.actor.id) {
      throw new Error("Incident recordedBy must match the service actor");
    }

    const streamId = this.incidentStreamId(input.incidentId);
    const streamEvents = await this.dependencies.ledger.readStream(streamId);
    if (
      streamEvents.some(
        (event) => event.type === "incident.recorded" && event.payload.incidentId === input.incidentId
      )
    ) {
      throw new Error(`Incident ${input.incidentId} is already recorded`);
    }

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
    const latestExposureEvent = this.findLatestNetworkExposure(exposureId, streamEvents);

    if (latestExposureEvent?.type !== "network.exposure.enabled") {
      throw new Error(`Cannot approve device session without an active network exposure ${exposureId}`);
    }

    return latestExposureEvent;
  }

  private findLatestNetworkExposure(
    exposureId: string,
    streamEvents: Awaited<ReturnType<EventLedger["readStream"]>>
  ): KnowledgeEventOf<"network.exposure.enabled"> | KnowledgeEventOf<"network.exposure.disabled"> | undefined {
    return streamEvents.findLast(
      (
        event
      ): event is KnowledgeEventOf<"network.exposure.enabled"> | KnowledgeEventOf<"network.exposure.disabled"> =>
        (event.type === "network.exposure.enabled" || event.type === "network.exposure.disabled") &&
        event.payload.exposureId === exposureId
    );
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

  private findLatestEvidenceCausation(
    evidenceId: string,
    streamEvents: Awaited<ReturnType<EventLedger["readStream"]>>
  ): Awaited<ReturnType<EventLedger["readStream"]>>[number] {
    const evidence = this.findIngestedEvidence(evidenceId, streamEvents);
    if (evidence === undefined) {
      throw new Error(`Cannot govern evidence ${evidenceId} without evidence.ingested`);
    }

    return streamEvents[streamEvents.length - 1] ?? evidence;
  }

  private evidenceStreamId(evidenceId: string): string {
    return `evidence_${evidenceId}`;
  }

  private incidentStreamId(incidentId: string): string {
    return `incident_${incidentId}`;
  }

  private async assertGeneratedArtifactAllowed(input: RecordGeneratedArtifactInput): Promise<void> {
    if (input.causationId === undefined) {
      throw new Error("Generated exports and reports require explicit causation");
    }

    if (input.sensitiveOptIns.length > 0 && this.actor.kind !== "human") {
      throw new Error("Sensitive export and report opt-ins require a human service actor");
    }

    for (const optIn of input.sensitiveOptIns) {
      if (optIn.approvedBy !== this.actor.id) {
        throw new Error("Sensitive opt-in approvedBy must match the service actor");
      }

      assertSecretSafeText(optIn.rationale);
    }

    const allEvents = await this.dependencies.ledger.readAll();
    const causationEvent = allEvents.find((event) => event.id === input.causationId);
    if (causationEvent === undefined) {
      throw new Error("Generated exports and reports require causation to reference an existing event");
    }

    const projection = buildGovernanceProjection(allEvents);
    const plan = projection.planExport({
      requestedEvidenceIds: input.includedEvidenceIds,
      sensitiveOptInTags: input.sensitiveOptIns.map((optIn) => optIn.tag)
    });

    if (plan.blockedEvidence.length > 0 || !sameSortedValues(plan.includedEvidenceIds, input.includedEvidenceIds)) {
      throw new Error("Cannot generate export or report outside the governed export plan");
    }

    const expectedContentHashes = expectedEvidenceContentHashes(
      input.includedEvidenceIds,
      allEvents
    );
    if (!sameSortedValues(expectedContentHashes, input.includedContentHashes)) {
      throw new Error("Generated artifact content hashes must match included evidence");
    }

    if (!eventReferencesAnyEvidence(causationEvent, input.includedEvidenceIds)) {
      throw new Error("Generated exports and reports require causation to reference included evidence");
    }

    const expectedDefaultPublicSafeOnly = input.sensitiveOptIns.length === 0;
    if (input.defaultPublicSafeOnly !== expectedDefaultPublicSafeOnly) {
      throw new Error("Generated artifact defaultPublicSafeOnly must match sensitive opt-in state");
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

function expectedEvidenceContentHashes(
  evidenceIds: readonly string[],
  events: Awaited<ReturnType<EventLedger["readAll"]>>
): string[] {
  const hashesByEvidenceId = new Map<string, string>();
  for (const event of events) {
    if (event.type === "evidence.ingested") {
      hashesByEvidenceId.set(event.payload.evidenceId, event.payload.contentHash);
    }
  }

  return evidenceIds.map((evidenceId) => hashesByEvidenceId.get(evidenceId)).filter((hash): hash is string => hash !== undefined);
}

function eventReferencesAnyEvidence(
  event: Awaited<ReturnType<EventLedger["readAll"]>>[number],
  evidenceIds: readonly string[]
): boolean {
  const includedEvidenceIds = new Set(evidenceIds);
  const payload = event.payload as Record<string, unknown>;
  const evidenceId = payload.evidenceId;
  if (typeof evidenceId === "string" && includedEvidenceIds.has(evidenceId)) {
    return true;
  }

  for (const field of ["evidenceIds", "includedEvidenceIds", "relatedEvidenceIds"] as const) {
    const values = payload[field];
    if (Array.isArray(values) && values.some((value) => typeof value === "string" && includedEvidenceIds.has(value))) {
      return true;
    }
  }

  return false;
}
