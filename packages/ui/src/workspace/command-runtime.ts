import type { PrrWorkspaceDto } from "../../../prr/src/read-api.js";
import type { AgentStatusDto } from "../agent/agent-types.js";
import type { EvidenceWorkspaceDto } from "../evidence/evidence-types.js";
import type {
  IngestionDiagnosticsDto,
  IngestionJobListDto,
  IngestionRuntimeDiagnosticDto,
  IngestionWorkspaceDto
} from "../ingestion/ingestion-types.js";
import type { OntologyWorkspaceDto } from "../ontology/ontology-types.js";
import type { OperatorStatusDto } from "../operator-status/operator-status-types.js";
import type {
  CommandBoardInput,
  CommandRuntimeDiagnostic,
  CommandRuntimeSourceId,
  CommandRuntimeSourceState,
  CommandRuntimeSourceStatus,
  EvidenceAlert,
  StatusMetric
} from "./command-types.js";
import { safeCommandText } from "./command-safety.js";

export type CommandRuntimeSource<T> =
  | { readonly state: "loading" }
  | {
      readonly state: "unavailable";
      readonly diagnosticId: string;
      readonly message: string;
    }
  | { readonly state: "ready"; readonly data: T };

export interface CommandIngestionRuntimeDto {
  readonly workspace: IngestionWorkspaceDto;
  readonly jobs: IngestionJobListDto;
  readonly diagnostics: IngestionDiagnosticsDto;
}

export interface CommandRuntimeSnapshot {
  readonly generatedAt: string;
  readonly requests: CommandRuntimeSource<PrrWorkspaceDto>;
  readonly evidence: CommandRuntimeSource<EvidenceWorkspaceDto>;
  readonly ingestion: CommandRuntimeSource<CommandIngestionRuntimeDto>;
  readonly ontology: CommandRuntimeSource<OntologyWorkspaceDto>;
  readonly operator: CommandRuntimeSource<OperatorStatusDto>;
  readonly agent: CommandRuntimeSource<AgentStatusDto>;
}

const sourceLabels: Record<CommandRuntimeSourceId, string> = {
  prr: "PRR",
  evidence: "Evidence",
  ingestion: "Ingestion",
  ontology: "Ontology",
  operator: "Operator status",
  agent: "Resident agent"
};

const sourceTargets: Record<CommandRuntimeSourceId, string> = {
  prr: "requests",
  evidence: "evidence",
  ingestion: "ingestion",
  ontology: "ontology",
  operator: "command",
  agent: "agents"
};

export function buildCommandBoardInputFromRuntime(
  snapshot: CommandRuntimeSnapshot,
  reviewedItemIds: readonly string[]
): CommandBoardInput {
  const requestWorkspace = sourceData(snapshot.requests);
  const evidenceWorkspace = sourceData(snapshot.evidence);
  const ingestionRuntime = sourceData(snapshot.ingestion);
  const ontologyWorkspace = sourceData(snapshot.ontology);
  const operatorStatus = sourceData(snapshot.operator);
  const agentStatus = sourceData(snapshot.agent);
  const runtimeSources = buildRuntimeSourceStatuses(snapshot);
  const runtimeDiagnostics = dedupeRuntimeDiagnostics([
    ...unavailableDiagnostics(snapshot),
    ...prrDiagnostics(requestWorkspace),
    ...evidenceDiagnostics(evidenceWorkspace),
    ...ingestionDiagnostics(ingestionRuntime),
    ...ontologyDiagnostics(ontologyWorkspace),
    ...operatorDiagnostics(operatorStatus),
    ...agentDiagnostics(agentStatus)
  ]);

  return {
    requestRows: requestWorkspace?.queueRows.map((row) => ({
      ...row,
      prrRequestId: safeCommandText(row.prrRequestId),
      agencyName: safeCommandText(row.agencyName)
    })) ?? [],
    diagnostics: [],
    evidenceAlerts: evidenceWorkspace === undefined
      ? []
      : evidenceWorkspace.items.map(evidenceAlert),
    todayIso: (requestWorkspace?.generatedAt ?? snapshot.generatedAt).slice(0, 10),
    reviewedItemIds,
    ...(agentStatus === undefined ? {} : { agentStatus }),
    runtimeDiagnostics,
    runtimeSources,
    supplementalMetrics: supplementalMetrics(snapshot),
    ...(requestWorkspace === undefined ? {} : { runtimeGeneratedAt: requestWorkspace.generatedAt })
  };
}

function sourceData<T>(source: CommandRuntimeSource<T>): T | undefined {
  return source.state === "ready" ? source.data : undefined;
}

function buildRuntimeSourceStatuses(snapshot: CommandRuntimeSnapshot): CommandRuntimeSourceStatus[] {
  return [
    statusForRequests(snapshot.requests),
    statusForEvidence(snapshot.evidence),
    statusForIngestion(snapshot.ingestion),
    statusForOntology(snapshot.ontology),
    statusForOperator(snapshot.operator),
    statusForAgent(snapshot.agent)
  ];
}

function statusForRequests(source: CommandRuntimeSource<PrrWorkspaceDto>): CommandRuntimeSourceStatus {
  if (source.state !== "ready") {
    return pendingOrUnavailableStatus("prr", source);
  }
  const errorCount = source.data.diagnostics.filter((diagnostic) => diagnostic.category.length > 0).length;
  return readyStatus(
    "prr",
    errorCount > 0 ? "degraded" : "ready",
    `${source.data.queueRows.length} request queue rows replayed from PRR state.`,
    source.data.queueRows.map((row) => row.prrRequestId),
    source.data.generatedAt
  );
}

function statusForEvidence(source: CommandRuntimeSource<EvidenceWorkspaceDto>): CommandRuntimeSourceStatus {
  if (source.state !== "ready") {
    return pendingOrUnavailableStatus("evidence", source);
  }
  return readyStatus(
    "evidence",
    source.data.status,
    `${source.data.items.length} evidence items available from the replayed evidence read model.`,
    source.data.items.map((item) => item.evidenceId)
  );
}

function statusForIngestion(source: CommandRuntimeSource<CommandIngestionRuntimeDto>): CommandRuntimeSourceStatus {
  if (source.state !== "ready") {
    return pendingOrUnavailableStatus("ingestion", source);
  }
  const diagnostics = [
    ...source.data.workspace.diagnostics,
    ...(source.data.jobs.diagnostics ?? []),
    ...source.data.diagnostics.diagnostics
  ];
  const degraded = !source.data.workspace.mounted || diagnostics.some((diagnostic) => diagnostic.severity !== "info");
  return readyStatus(
    "ingestion",
    degraded ? "degraded" : "ready",
    source.data.workspace.mounted
      ? `${source.data.jobs.jobs.length} ingestion jobs visible for the mounted workspace.`
      : "The ingestion workspace is not mounted; no fixture state was substituted.",
    uniqueRefs([
      ...(source.data.workspace.workspaceId === undefined ? [] : [source.data.workspace.workspaceId]),
      ...source.data.jobs.jobs.map((job) => job.jobId)
    ])
  );
}

function statusForOntology(source: CommandRuntimeSource<OntologyWorkspaceDto>): CommandRuntimeSourceStatus {
  if (source.state !== "ready") {
    return pendingOrUnavailableStatus("ontology", source);
  }
  const proposed = source.data.assertions.filter((assertion) => assertion.reviewState === "proposed").length;
  return readyStatus(
    "ontology",
    source.data.status,
    `${proposed} ontology assertion proposals still require human review.`,
    source.data.assertions.map((assertion) => assertion.assertionId)
  );
}

function statusForOperator(source: CommandRuntimeSource<OperatorStatusDto>): CommandRuntimeSourceStatus {
  if (source.state !== "ready") {
    return pendingOrUnavailableStatus("operator", source);
  }
  const state = source.data.runtime.available
    ? operatorState(source.data.summary.overallState)
    : "unavailable";
  return readyStatus(
    "operator",
    state,
    safeCommandText(source.data.runtime.safeMessage),
    source.data.sections.map((section) => section.sectionId),
    source.data.generatedAt
  );
}

function statusForAgent(source: CommandRuntimeSource<AgentStatusDto>): CommandRuntimeSourceStatus {
  if (source.state !== "ready") {
    return pendingOrUnavailableStatus("agent", source);
  }
  const lifecycleState = source.data.identityLifecycle.state;
  const state: CommandRuntimeSourceState = lifecycleState === "not-mounted"
    ? "unavailable"
    : lifecycleState === "ready" && !source.data.diagnostics.some((diagnostic) => diagnostic.severity === "error")
      ? source.data.diagnostics.some((diagnostic) => diagnostic.severity === "warning") ? "degraded" : "ready"
      : "degraded";
  return readyStatus(
    "agent",
    state,
    lifecycleState === "not-mounted"
      ? "Resident agent runtime is unavailable."
      : `${source.data.pendingApprovalCount} pending approvals and ${source.data.activeLockCount} active locks.`,
    uniqueRefs([
      source.data.residentAgentId,
      ...source.data.tasks.map((task) => task.taskId),
      ...source.data.toolRequests.map((request) => request.toolRequestId),
      ...source.data.locks.map((lock) => lock.lockId)
    ]),
    source.data.generatedAt
  );
}

function pendingOrUnavailableStatus<T>(
  sourceId: CommandRuntimeSourceId,
  source: Exclude<CommandRuntimeSource<T>, { readonly state: "ready"; readonly data: T }>
): CommandRuntimeSourceStatus {
  const loading = source.state === "loading";
  return {
    sourceId,
    label: sourceLabels[sourceId],
    state: loading ? "loading" : "unavailable",
    summary: loading
      ? `Waiting for the browser-safe ${sourceLabels[sourceId]} runtime DTO.`
      : safeCommandText(source.message),
    provenanceRefs: [],
    actionLabel: loading ? "Wait for runtime" : actionLabel(sourceId),
    actionTarget: sourceTargets[sourceId]
  };
}

function readyStatus(
  sourceId: CommandRuntimeSourceId,
  state: CommandRuntimeSourceState,
  summary: string,
  provenanceRefs: readonly string[],
  runtimeTimestamp?: string
): CommandRuntimeSourceStatus {
  return {
    sourceId,
    label: sourceLabels[sourceId],
    state,
    summary: safeCommandText(summary),
    provenanceRefs: uniqueRefs(provenanceRefs),
    ...(runtimeTimestamp === undefined ? {} : { runtimeTimestamp }),
    actionLabel: actionLabel(sourceId),
    actionTarget: sourceTargets[sourceId]
  };
}

function actionLabel(sourceId: CommandRuntimeSourceId): string {
  if (sourceId === "operator") {
    return "Refresh Command";
  }
  return `Open ${sourceLabels[sourceId]}`;
}

function operatorState(state: OperatorStatusDto["summary"]["overallState"]): CommandRuntimeSourceState {
  return state === "ready" ? "ready" : state === "unavailable" ? "unavailable" : "degraded";
}

function unavailableDiagnostics(snapshot: CommandRuntimeSnapshot): CommandRuntimeDiagnostic[] {
  const sources = Object.entries({
    prr: snapshot.requests,
    evidence: snapshot.evidence,
    ingestion: snapshot.ingestion,
    ontology: snapshot.ontology,
    operator: snapshot.operator,
    agent: snapshot.agent
  }) as Array<[CommandRuntimeSourceId, CommandRuntimeSource<unknown>]>;

  return sources.flatMap(([sourceId, source]) => source.state === "unavailable"
    ? [{
        diagnosticId: source.diagnosticId,
        sourceId,
        severity: "error" as const,
        message: safeCommandText(source.message),
        basis: `${sourceLabels[sourceId]} runtime DTO was unavailable; no fixture data was substituted.`,
        recommendedAction: actionLabel(sourceId),
        provenanceRefs: [],
        actionTarget: sourceTargets[sourceId],
        priorityKind: "diagnostic" as const
      }]
    : []);
}

function evidenceAlert(item: EvidenceWorkspaceDto["items"][number]): EvidenceAlert {
  const activeConfidences = item.governanceTags
    .filter((tag) => tag.status === "active")
    .map((tag) => tag.confidence);
  const confidence = activeConfidences.length === 0 ? undefined : Math.max(...activeConfidences);
  const linkedRequestId = item.linkedReferences.find((reference) => reference.kind === "prr")?.id;
  const sourceLabel = item.source === undefined
    ? "evidence workspace"
    : `${safeCommandText(item.source.kind)} / ${safeCommandText(item.source.label)}`;
  const provenanceRefs = uniqueRefs([
    item.evidenceId,
    ...(item.contentHash === undefined ? [] : [item.contentHash]),
    ...item.sourceCollections.map((source) => source.sourceCollectionId),
    ...item.importBatchIds,
    ...item.occurrences.map((occurrence) => occurrence.occurrenceId),
    ...item.governanceTags.map((tag) => tag.eventId),
    ...item.linkedReferences.flatMap((reference) => [reference.id, ...reference.eventIds])
  ]);

  return {
    evidenceId: safeCommandText(item.evidenceId),
    title: item.source === undefined
      ? `Evidence ${safeCommandText(item.evidenceId)} needs review`
      : `${safeCommandText(item.source.label)} evidence needs review`,
    sourceLabel,
    ...(linkedRequestId === undefined ? {} : { linkedRequestId: safeCommandText(linkedRequestId) }),
    ...(confidence === undefined ? {} : { confidence }),
    uncertainty: safeCommandText(`Receipt timestamp is unavailable from evidence-workspace.v1. ${item.blockingReasons[0]
      ?? (confidence === undefined
        ? "Governance classification confidence is unavailable."
        : "Classification confidence is advisory until human governance review.")}`),
    provenanceRefs
  };
}

function evidenceDiagnostics(workspace: EvidenceWorkspaceDto | undefined): CommandRuntimeDiagnostic[] {
  return (workspace?.diagnostics ?? []).map((diagnostic, index) => ({
    diagnosticId: `evidence_${diagnostic.code}_${index + 1}`,
    sourceId: "evidence",
    severity: diagnostic.severity,
    message: safeCommandText(diagnostic.message),
    basis: safeCommandText(`evidence-workspace.v1 / ${diagnostic.code}`),
    recommendedAction: "Open Evidence",
    provenanceRefs: [`evidence-workspace:${workspace?.sourceHighWaterMark ?? 0}`],
    actionTarget: "evidence",
    priorityKind: "diagnostic" as const
  }));
}

function prrDiagnostics(workspace: PrrWorkspaceDto | undefined): CommandRuntimeDiagnostic[] {
  return (workspace?.diagnostics ?? []).map((diagnostic) => ({
    diagnosticId: diagnostic.diagnosticId,
    sourceId: "prr",
    severity: "error",
    message: safeCommandText(diagnostic.message),
    basis: `PRR read model / ${safeCommandText(diagnostic.category)} / ${safeCommandText(diagnostic.repairHint.violatedPath)}`,
    recommendedAction: safeCommandText(diagnostic.repairHint.allowedActions[0] ?? "Open Requests"),
    provenanceRefs: uniqueRefs([
      diagnostic.diagnosticId,
      diagnostic.prrRequestId,
      diagnostic.eventId
    ]),
    ...(workspace === undefined ? {} : { runtimeTimestamp: workspace.generatedAt }),
    actionTarget: "requests",
    priorityKind: "diagnostic" as const
  }));
}

function ingestionDiagnostics(runtime: CommandIngestionRuntimeDto | undefined): CommandRuntimeDiagnostic[] {
  if (runtime === undefined) {
    return [];
  }
  const diagnostics = uniqueIngestionDiagnostics([
    ...runtime.workspace.diagnostics,
    ...(runtime.jobs.diagnostics ?? []),
    ...runtime.diagnostics.diagnostics
  ]);
  const fromDiagnostics = diagnostics
    .filter((diagnostic) => diagnostic.severity !== "info")
    .map((diagnostic, index) => ({
      diagnosticId: diagnostic.diagnosticId ?? `ingestion_${index + 1}`,
      sourceId: "ingestion" as const,
      severity: diagnostic.severity as "warning" | "error",
      message: safeCommandText(diagnostic.message),
      basis: `ingestion runtime / ${safeCommandText(diagnostic.category)}`,
      recommendedAction: "Open Ingestion",
      provenanceRefs: uniqueRefs([
        ...(diagnostic.diagnosticId === undefined ? [] : [diagnostic.diagnosticId]),
        ...(runtime.workspace.workspaceId === undefined ? [] : [runtime.workspace.workspaceId])
      ]),
      actionTarget: "ingestion",
      priorityKind: "diagnostic" as const
    }));
  const failedJobs = runtime.jobs.jobs
    .filter((job) => job.state === "failed")
    .map((job) => ({
      diagnosticId: `job_${job.jobId}`,
      sourceId: "ingestion" as const,
      severity: "error" as const,
      message: `Ingestion job ${safeCommandText(job.jobId)} failed safely.`,
      basis: safeCommandText(`${job.kind} job state from the ingestion runtime`),
      recommendedAction: "Open Ingestion",
      provenanceRefs: uniqueRefs([job.jobId, ...job.diagnosticIds]),
      actionTarget: "ingestion",
      priorityKind: "diagnostic" as const
    }));
  return [...fromDiagnostics, ...failedJobs];
}

function ontologyDiagnostics(workspace: OntologyWorkspaceDto | undefined): CommandRuntimeDiagnostic[] {
  if (workspace === undefined) {
    return [];
  }
  const diagnostics = workspace.diagnostics.map((diagnostic, index) => ({
    diagnosticId: `ontology_${diagnostic.code}_${index + 1}`,
    sourceId: "ontology" as const,
    severity: diagnostic.severity,
    message: safeCommandText(diagnostic.message),
    basis: safeCommandText(`ontology-workspace.v1 / ${diagnostic.code}`),
    recommendedAction: "Open Ontology",
    provenanceRefs: [`ontology-workspace:${workspace.sourceHighWaterMark}`],
    actionTarget: "ontology",
    priorityKind: "diagnostic" as const
  }));
  const proposals = workspace.assertions
    .filter((assertion) => assertion.reviewState === "proposed")
    .map((assertion) => ({
      diagnosticId: `proposal_${assertion.assertionId}`,
      sourceId: "ontology" as const,
      severity: "warning" as const,
      message: `Ontology assertion ${safeCommandText(assertion.assertionId)} awaits human review.`,
      basis: `${safeCommandText(assertion.predicate)} at ${Math.round(assertion.confidence * 100)}% proposal confidence`,
      recommendedAction: "Open Ontology",
      provenanceRefs: uniqueRefs([
        assertion.assertionId,
        assertion.evidenceId,
        ...assertion.eventIds
      ]),
      actionTarget: "ontology",
      priorityKind: "advisory" as const
    }));
  return [...diagnostics, ...proposals];
}

function operatorDiagnostics(status: OperatorStatusDto | undefined): CommandRuntimeDiagnostic[] {
  if (status === undefined) {
    return [];
  }
  return status.sections.flatMap((section) => {
    const diagnostics = section.diagnostics.map((diagnostic) => ({
      diagnosticId: diagnostic.diagnosticId,
      sourceId: "operator" as const,
      severity: diagnostic.severity === "info" ? "warning" as const : diagnostic.severity,
      message: safeCommandText(diagnostic.message),
      basis: safeCommandText(`operator-status.v1 / ${section.sectionId} / ${diagnostic.category}`),
      recommendedAction: "Refresh Command",
      provenanceRefs: uniqueRefs([
        diagnostic.diagnosticId,
        ...diagnostic.refs.map((ref) => `${safeCommandText(ref.label)}:${safeCommandText(String(ref.value))}`)
      ]),
      runtimeTimestamp: status.generatedAt,
      actionTarget: "command",
      priorityKind: "diagnostic" as const
    }));
    if (diagnostics.length > 0 || section.state === "ready") {
      return diagnostics;
    }
    return [{
      diagnosticId: `operator_${section.sectionId}_${section.state}`,
      sourceId: "operator" as const,
      severity: section.state === "blocked" || section.state === "unavailable" ? "error" as const : "warning" as const,
      message: safeCommandText(section.headline),
      basis: `operator-status.v1 section state ${section.state}`,
      recommendedAction: "Refresh Command",
      provenanceRefs: uniqueRefs([
        section.sectionId,
        ...section.sourceEvidence.map((evidence) => evidence.evidenceId)
      ]),
      runtimeTimestamp: status.generatedAt,
      actionTarget: "command",
      priorityKind: "diagnostic" as const
    }];
  });
}

function agentDiagnostics(status: AgentStatusDto | undefined): CommandRuntimeDiagnostic[] {
  if (status === undefined) {
    return [];
  }
  const diagnostics = status.diagnostics.map((diagnostic, index) => ({
    diagnosticId: diagnostic.diagnosticId ?? `agent_${index + 1}`,
    sourceId: "agent" as const,
    severity: diagnostic.severity === "info" ? "warning" as const : diagnostic.severity,
    message: safeCommandText(diagnostic.message),
    basis: `agent-status.v1 / ${safeCommandText(diagnostic.category)}`,
    recommendedAction: "Open Resident agent",
    provenanceRefs: uniqueRefs([diagnostic.diagnosticId]),
    runtimeTimestamp: status.generatedAt,
    actionTarget: "agents",
    priorityKind: "diagnostic" as const
  }));
  const approvals = status.toolRequests
    .filter((request) => request.state === "requested")
    .map((request) => ({
      diagnosticId: `approval_${request.toolRequestId}`,
      sourceId: "agent" as const,
      severity: "warning" as const,
      message: `Agent approval ${safeCommandText(request.toolRequestId)} awaits human review.`,
      basis: safeCommandText(`${request.requiredApprovalClass} approval for ${request.sideEffectClass}`),
      recommendedAction: "Open Resident agent",
      provenanceRefs: uniqueRefs([
        request.toolRequestId,
        request.runId,
        ...request.sourceEventIds,
        ...request.eventIds
      ]),
      runtimeTimestamp: request.requestedAt,
      actionTarget: "agents",
      priorityKind: "advisory" as const
    }));
  return [...diagnostics, ...approvals];
}

function supplementalMetrics(snapshot: CommandRuntimeSnapshot): StatusMetric[] {
  const ingestion = sourceData(snapshot.ingestion);
  const ontology = sourceData(snapshot.ontology);
  const operator = sourceData(snapshot.operator);
  const agent = sourceData(snapshot.agent);
  const ingestionAttention = ingestion?.workspace.mounted === true
    ? ingestion.jobs.jobs.filter((job) =>
        job.state === "queued" || job.state === "running" || job.state === "failed"
      ).length
    : undefined;
  const ontologyGaps = ontology === undefined
    ? undefined
    : ontology.assertions.filter((assertion) => assertion.reviewState === "proposed").length + ontology.diagnostics.length;
  const operatorAttention = operator === undefined || !operator.runtime.available
    ? undefined
    : operator.summary.blockedCount + operator.summary.actionRequiredCount + operator.summary.degradedCount;
  const pendingApprovals = agent?.identityLifecycle.state === "not-mounted"
    ? undefined
    : agent?.pendingApprovalCount;

  return [
    metric("ingestion-attention", "Ingestion attention", ingestionAttention, ingestionAttention === 0 ? "green" : "amber"),
    metric("ontology-gaps", "Ontology gaps", ontologyGaps, ontologyGaps === 0 ? "green" : "amber"),
    metric("operator-attention", "Operator attention", operatorAttention, operatorAttention === 0 ? "green" : "red"),
    metric("agent-approvals", "Agent approvals", pendingApprovals, pendingApprovals === 0 ? "green" : "amber")
  ];
}

function metric(
  id: string,
  label: string,
  value: number | undefined,
  tone: StatusMetric["tone"]
): StatusMetric {
  return {
    id,
    label,
    value: value === undefined ? "—" : String(value),
    tone: value === undefined ? "neutral" : tone
  };
}

function uniqueIngestionDiagnostics(
  diagnostics: readonly IngestionRuntimeDiagnosticDto[]
): readonly IngestionRuntimeDiagnosticDto[] {
  const seen = new Set<string>();
  return diagnostics.filter((diagnostic) => {
    const key = `${diagnostic.diagnosticId ?? "none"}\u0000${diagnostic.category}\u0000${diagnostic.message}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function dedupeRuntimeDiagnostics(
  diagnostics: readonly CommandRuntimeDiagnostic[]
): CommandRuntimeDiagnostic[] {
  const seen = new Set<string>();
  return diagnostics.map((diagnostic) => ({
    ...diagnostic,
    diagnosticId: safeCommandText(diagnostic.diagnosticId),
    message: safeCommandText(diagnostic.message),
    basis: safeCommandText(diagnostic.basis),
    recommendedAction: safeCommandText(diagnostic.recommendedAction),
    provenanceRefs: uniqueRefs(diagnostic.provenanceRefs)
  })).filter((diagnostic) => {
    const key = `${diagnostic.sourceId}\u0000${diagnostic.diagnosticId}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function uniqueRefs(refs: readonly (string | undefined)[]): string[] {
  return [...new Set(
    refs
      .filter((ref): ref is string => typeof ref === "string" && ref.length > 0)
      .map(safeCommandText)
  )];
}
