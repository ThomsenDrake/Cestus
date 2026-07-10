import {
  buildOperatorStatusSummary,
  operatorStatusDtoSchema,
  operatorStatusSectionSchema,
  type OperatorDiagnosticDto,
  type OperatorReadinessState,
  type OperatorSafeActionDto,
  type OperatorSourceEvidenceDto,
  type OperatorStatusDto,
  type OperatorStatusSectionDto
} from "../../operator-status/src/contracts.js";
import type {
  IngestionDiagnosticsDto,
  IngestionJobListDto,
  IngestionRuntimeDiagnosticDto,
  IngestionWorkspaceDto
} from "../../ingestion/src/runtime-types.js";
import type {
  AgentRuntimeDiagnosticDto,
  AgentStatusDto
} from "../../agent/src/runtime-types.js";
import type { LegacyMigrationReviewDto } from "../../ingestion/src/legacy-read-api.js";
import type { PrrWorkspaceDto } from "../../prr/src/read-api.js";
import type {
  WorkspaceDiagnosticDto,
  WorkspaceOpsEnvelope,
  WorkspaceVerifyDto
} from "../../workspace-ops/src/contracts.js";

export interface OperatorStatusProviderSet {
  readonly workspace?: () => Promise<WorkspaceOpsEnvelope<WorkspaceVerifyDto>>;
  readonly ingestion?: () => Promise<OperatorIngestionStatusProviderDto>;
  readonly legacy?: () => Promise<LegacyMigrationReviewDto>;
  readonly prr?: () => Promise<OperatorPrrStatusProviderDto>;
  readonly agent?: () => Promise<AgentStatusDto>;
}

export interface OperatorIngestionStatusProviderDto {
  readonly workspace: IngestionWorkspaceDto;
  readonly jobs: IngestionJobListDto;
  readonly diagnostics: IngestionDiagnosticsDto;
}

export type OperatorPrrStatusProviderDto = Pick<PrrWorkspaceDto, "cards" | "diagnostics">;

export interface BuildOperatorStatusDtoInput extends OperatorStatusProviderSet {
  readonly now: () => string;
  readonly runtime: OperatorStatusDto["runtime"];
}

const safeActions: readonly OperatorSafeActionDto[] = Object.freeze([
  {
    actionId: "action_refresh_operator_status",
    label: "Refresh status",
    kind: "refresh-status",
    sourceContract: "operator-status.v1",
    requiresHumanApproval: false,
    mutatesCanonicalState: false,
    externalEffect: false,
    enabled: true
  },
  {
    actionId: "action_open_command",
    label: "Open Command",
    kind: "navigate",
    target: "command",
    sourceContract: "operator-status.v1",
    requiresHumanApproval: false,
    mutatesCanonicalState: false,
    externalEffect: false,
    enabled: true
  },
  {
    actionId: "action_open_ingestion",
    label: "Open Ingestion",
    kind: "navigate",
    target: "ingestion",
    sourceContract: "operator-status.v1",
    requiresHumanApproval: false,
    mutatesCanonicalState: false,
    externalEffect: false,
    enabled: true
  },
  {
    actionId: "action_open_requests",
    label: "Open Requests",
    kind: "navigate",
    target: "requests",
    sourceContract: "operator-status.v1",
    requiresHumanApproval: false,
    mutatesCanonicalState: false,
    externalEffect: false,
    enabled: true
  },
  {
    actionId: "action_open_agents",
    label: "Open Agent",
    kind: "navigate",
    target: "agents",
    sourceContract: "agent-status.v1",
    requiresHumanApproval: false,
    mutatesCanonicalState: false,
    externalEffect: false,
    enabled: true
  },
  {
    actionId: "action_show_workspace_verify",
    label: "Show workspace verify command",
    kind: "show-command",
    command: "cestus-workspace verify workspace --root <root>",
    sourceContract: "workspace-ops.v1",
    requiresHumanApproval: false,
    mutatesCanonicalState: false,
    externalEffect: false,
    enabled: true
  },
  {
    actionId: "action_show_workspace_detect_drive",
    label: "Show workspace drive detection command",
    kind: "show-command",
    command: "cestus-workspace detect drive --root <root>",
    sourceContract: "workspace-ops.v1",
    requiresHumanApproval: false,
    mutatesCanonicalState: false,
    externalEffect: false,
    enabled: true
  },
  {
    actionId: "action_show_workspace_select_mount",
    label: "Show workspace mount selection command",
    kind: "show-command",
    command: "npm run local:runtime:configure -- --storage portable-workspace --workspace <root>",
    sourceContract: "local-runtime",
    requiresHumanApproval: true,
    mutatesCanonicalState: false,
    externalEffect: false,
    enabled: true
  },
  {
    actionId: "action_show_workspace_create",
    label: "Show workspace create command",
    kind: "show-command",
    command: "npm run local:workspace:create -- --workspace <root> --workspace-id <id> --label <label>",
    sourceContract: "local-runtime",
    requiresHumanApproval: true,
    mutatesCanonicalState: false,
    externalEffect: false,
    enabled: true
  },
  {
    actionId: "action_show_projection_rebuild_readiness",
    label: "Show projection rebuild-readiness command",
    kind: "show-command",
    command: "cestus-workspace projection rebuild-readiness --root <root>",
    sourceContract: "workspace-ops.v1",
    requiresHumanApproval: false,
    mutatesCanonicalState: false,
    externalEffect: false,
    enabled: true
  },
  {
    actionId: "action_show_legacy_import_help",
    label: "Show legacy import help command",
    kind: "show-command",
    command: "npm run ingestion:help",
    sourceContract: "ingestion",
    requiresHumanApproval: false,
    mutatesCanonicalState: false,
    externalEffect: false,
    enabled: true
  }
]);

export async function buildOperatorStatusDto(
  input: BuildOperatorStatusDtoInput
): Promise<OperatorStatusDto> {
  if (!input.runtime.available) {
    const sections = runtimeUnavailableSections();

    return operatorStatusDtoSchema.parse({
      schemaVersion: "operator-status.v1",
      generatedAt: input.now(),
      runtime: input.runtime,
      summary: buildAggregateStatusSummary(sections),
      sections,
      safeActions
    });
  }

  const [workspace, ingestion, legacy, prr, agent] = await Promise.all([
    buildWorkspaceSection(input.workspace),
    buildIngestionSection(input.ingestion),
    buildLegacyImportSection(input.legacy),
    buildPrrSection(input.prr),
    buildAgentSection(input.agent)
  ]);
  const sections = [workspace, ingestion, legacy, prr, agent];

  return operatorStatusDtoSchema.parse({
    schemaVersion: "operator-status.v1",
    generatedAt: input.now(),
    runtime: input.runtime,
    summary: buildAggregateStatusSummary(sections),
    sections,
    safeActions
  });
}

async function buildWorkspaceSection(
  provider: OperatorStatusProviderSet["workspace"] | undefined
): Promise<OperatorStatusSectionDto> {
  if (provider === undefined) {
    return unavailableSection("workspace", "Workspace", "workspace-ops.v1");
  }

  try {
    const envelope = await provider();
    const payload = envelope.payload;
    const state = workspaceState(envelope, payload);
    const nextSafeActionIds = workspaceNextSafeActionIds(envelope, payload, state);

    return safeSection({
      sectionId: "workspace",
      label: "Workspace",
      state,
      headline: headlineForWorkspace(envelope, payload),
      safeSummary: summaryForWorkspace(envelope, payload),
      metrics: [
        { metricId: "ledger_events", label: "Ledger events", value: String(payload?.ledger.eventCount ?? 0), tone: "healthy" },
        { metricId: "ledger_high_water", label: "High-water mark", value: String(payload?.ledger.highWaterMark ?? 0), tone: "machine" },
        { metricId: "projection_stale_count", label: "Stale projections", value: String(payload?.projections.staleCount ?? 0), tone: payload?.projections.staleCount === 0 ? "healthy" : "attention" },
        { metricId: "workspace_errors", label: "Visible errors", value: String(payload?.diagnostics.errorCount ?? envelope.diagnostics.filter((diagnostic) => diagnostic.severity === "error").length), tone: "danger" }
      ],
      diagnostics: workspaceDiagnostics(envelope.diagnostics),
      sourceEvidence: [
        workspaceSourceEvidence(envelope, payload)
      ],
      nextSafeActionIds
    }, unavailableSection("workspace", "Workspace", "workspace-ops.v1"));
  } catch {
    return unavailableSection("workspace", "Workspace", "workspace-ops.v1");
  }
}

async function buildIngestionSection(
  provider: OperatorStatusProviderSet["ingestion"] | undefined
): Promise<OperatorStatusSectionDto> {
  if (provider === undefined) {
    return unavailableSection("ingestion", "Ingestion", "ingestion");
  }

  try {
    const ingestion = await provider();
    const workspace = ingestion.workspace;
    const review = workspace.review;
    const diagnostics = [
      ...workspace.diagnostics,
      ...reviewDiagnostics(review),
      ...ingestion.diagnostics.diagnostics
    ];
    const failedJobs = ingestion.jobs.jobs.filter((job) => job.state === "failed").length;
    const state = ingestionState(workspace, diagnostics, failedJobs);

    return safeSection({
      sectionId: "ingestion",
      label: "Ingestion",
      state,
      headline: workspace.mounted
        ? review?.approvalRequired === true
          ? "Raw import approval required"
          : "Ingestion workspace mounted"
        : "Ingestion workspace is not mounted",
      safeSummary: workspace.mounted
        ? "Ingestion status is read from mounted workspace DTOs; approval gates remain in ingestion."
        : "Ingestion cannot run until the configured workspace is mounted.",
      metrics: [
        { metricId: "observed_files", label: "Observed files", value: String(review?.totals.observedFiles ?? 0), tone: "machine" },
        { metricId: "unique_content", label: "Unique content", value: String(review?.totals.uniqueContent ?? 0), tone: "machine" },
        { metricId: "queued_jobs", label: "Queued jobs", value: String(ingestion.jobs.jobs.filter((job) => job.state === "queued").length), tone: "neutral" },
        { metricId: "failed_jobs", label: "Failed jobs", value: String(failedJobs), tone: failedJobs > 0 ? "danger" : "healthy" }
      ],
      diagnostics: ingestionDiagnostics(diagnostics),
      sourceEvidence: [
        sourceEvidence("src_ingestion_workspace", "ingestion", "ingestion", "ingestion workspace", [
          ...(workspace.workspaceId === undefined ? [] : [{ label: "workspaceId", value: workspace.workspaceId }]),
          ...(review === undefined ? [] : [{ label: "sourceCollectionId", value: review.sourceCollectionId }]),
          ...(review?.latestScanBatchId === undefined ? [] : [{ label: "scanBatchId", value: review.latestScanBatchId }])
        ])
      ],
      nextSafeActionIds: state === "ready"
        ? ["action_refresh_operator_status"]
        : ["action_open_ingestion", "action_refresh_operator_status"]
    }, unavailableSection("ingestion", "Ingestion", "ingestion"));
  } catch {
    return unavailableSection("ingestion", "Ingestion", "ingestion");
  }
}

async function buildLegacyImportSection(
  provider: OperatorStatusProviderSet["legacy"] | undefined
): Promise<OperatorStatusSectionDto> {
  if (provider === undefined) {
    return unavailableSection("legacy-import", "Legacy Import", "legacy-import");
  }

  try {
    const legacy = await provider();
    const errorCount = legacy.diagnostics.filter((diagnostic) => diagnostic.severity === "error").length;
    const warningCount = legacy.diagnostics.filter((diagnostic) => diagnostic.severity === "warning").length;
    const samplesStillNeeded = legacy.latestReportId === undefined && legacy.firstArtifactAsk.length > 0;
    const actionRequired =
      samplesStillNeeded ||
      legacy.rawImportRequiresApproval ||
      !legacy.ontologyStagingApproved;
    const state: OperatorReadinessState = errorCount > 0
      ? "blocked"
      : actionRequired
        ? "action-required"
        : warningCount > 0
          ? "degraded"
          : "ready";

    return safeSection({
      sectionId: "legacy-import",
      label: "Legacy Import",
      state,
      headline: samplesStillNeeded
        ? "Legacy samples needed"
        : legacy.rawImportRequiresApproval
          ? "Raw legacy import approval required"
          : "Legacy import review readable",
      safeSummary: "Legacy staging may propose evidence-tied assertions only; it does not accept graph truth.",
      metrics: [
        { metricId: "sample_asks", label: "Sample asks", value: String(legacy.firstArtifactAsk.length), tone: legacy.firstArtifactAsk.length > 0 ? "attention" : "healthy" },
        { metricId: "raw_approval_required", label: "Raw approval", value: legacy.rawImportRequiresApproval ? "required" : "not required", tone: legacy.rawImportRequiresApproval ? "attention" : "healthy" },
        { metricId: "staging_approved", label: "Staging approved", value: legacy.ontologyStagingApproved ? "yes" : "no", tone: legacy.ontologyStagingApproved ? "healthy" : "attention" }
      ],
      diagnostics: legacyDiagnostics(legacy, samplesStillNeeded),
      sourceEvidence: [
        sourceEvidence("src_legacy_review", "legacy-import", "legacy-import", "legacy migration review", [
          { label: "sourceCollectionId", value: legacy.sourceCollectionId },
          ...(legacy.latestReportId === undefined ? [] : [{ label: "legacyReportId", value: legacy.latestReportId }])
        ])
      ],
      nextSafeActionIds: legacyNextSafeActionIds(legacy, state, samplesStillNeeded)
    }, unavailableSection("legacy-import", "Legacy Import", "legacy-import"));
  } catch {
    return unavailableSection("legacy-import", "Legacy Import", "legacy-import");
  }
}

async function buildPrrSection(
  provider: OperatorStatusProviderSet["prr"] | undefined
): Promise<OperatorStatusSectionDto> {
  if (provider === undefined) {
    return unavailableSection("prr", "PRR", "prr");
  }

  try {
    const prr = await provider();
    const diagnosticCount = prr.diagnostics.length;
    const state: OperatorReadinessState = diagnosticCount > 0 ? "degraded" : "ready";

    return safeSection({
      sectionId: "prr",
      label: "PRR",
      state,
      headline: prr.cards.length === 0 ? "PRR workspace ready with no open requests" : "PRR workspace readable",
      safeSummary: "PRR cards are read from the replayed workspace DTO; send and legal escalation gates stay locked elsewhere.",
      metrics: [
        { metricId: "request_cards", label: "Request cards", value: String(prr.cards.length), tone: "machine" },
        { metricId: "diagnostics", label: "Diagnostics", value: String(diagnosticCount), tone: diagnosticCount > 0 ? "attention" : "healthy" }
      ],
      diagnostics: [
        ...prrDiagnostics(prr.diagnostics),
        ...(prr.cards.length === 0 && diagnosticCount === 0
          ? [
              {
                diagnosticId: "diag_prr_zero_open_requests",
                severity: "info" as const,
                category: "prr" as const,
                message: "PRR workspace is readable with zero open requests.",
                refs: [{ label: "cardCount", value: 0 }]
              }
            ]
          : [])
      ],
      sourceEvidence: [
        sourceEvidence("src_prr_workspace", "prr", "prr", "PRR workspace read DTO", [
          { label: "cardCount", value: prr.cards.length }
        ])
      ],
      nextSafeActionIds: ["action_open_requests", "action_refresh_operator_status"]
    }, unavailableSection("prr", "PRR", "prr"));
  } catch {
    return unavailableSection("prr", "PRR", "prr");
  }
}

async function buildAgentSection(
  provider: OperatorStatusProviderSet["agent"] | undefined
): Promise<OperatorStatusSectionDto> {
  if (provider === undefined) {
    return unavailableSection("agent", "Agent", "agent-status.v1");
  }

  try {
    const agent = await provider();
    const state = agentState(agent);

    return safeSection({
      sectionId: "agent",
      label: "Agent",
      state,
      headline: headlineForAgent(agent, state),
      safeSummary: "Resident agent status is read from agent-status.v1; operator status can only navigate to the Agent workspace.",
      metrics: [
        { metricId: "tasks", label: "Tasks", value: String(agent.tasks.length), tone: "machine" },
        {
          metricId: "pending_approvals",
          label: "Pending approvals",
          value: String(agent.pendingApprovalCount),
          tone: agent.pendingApprovalCount > 0 ? "attention" : "healthy"
        },
        {
          metricId: "active_locks",
          label: "Active locks",
          value: String(agent.activeLockCount),
          tone: agent.activeLockCount > 0 ? "danger" : "healthy"
        },
        {
          metricId: "providers",
          label: "Providers",
          value: String(agent.providers.length),
          tone: agent.providers.length > 0 ? "healthy" : "attention"
        }
      ],
      diagnostics: [
        ...identityLifecycleDiagnostics(agent),
        ...agentDiagnostics(agent.diagnostics)
      ],
      sourceEvidence: [
        sourceEvidence("src_agent_status", "agent-status.v1", "agent", "resident agent status", [
          { label: "schemaVersion", value: agent.schemaVersion },
          { label: "generatedAt", value: safeMessage(agent.generatedAt) },
          { label: "identityLifecycleState", value: agent.identityLifecycle.state },
          ...(agent.identityLifecycle.workspaceId === undefined
            ? []
            : [{ label: "identityLifecycleWorkspaceId", value: safeMessage(agent.identityLifecycle.workspaceId) }]),
          ...(agent.residentAgentId === undefined
            ? []
            : [{ label: "residentAgentId", value: safeMessage(agent.residentAgentId) }])
        ])
      ],
      nextSafeActionIds: ["action_open_agents", "action_refresh_operator_status"]
    }, unavailableSection("agent", "Agent", "agent-status.v1"));
  } catch {
    return unavailableSection("agent", "Agent", "agent-status.v1");
  }
}

function buildAggregateStatusSummary(
  sections: readonly OperatorStatusSectionDto[]
): OperatorStatusDto["summary"] {
  const summary = buildOperatorStatusSummary(sections);
  const unavailable = sections.filter((section) => section.state === "unavailable");
  if (unavailable.length === 0 || summary.overallState !== "ready") {
    return summary;
  }
  if (unavailable.length === sections.length) {
    return { ...summary, overallState: "unavailable" };
  }
  return {
    ...summary,
    overallState: "degraded",
    degradedCount: summary.degradedCount + unavailable.length,
    nextSafeActionId: unavailable[0]?.nextSafeActionIds[0] ?? summary.nextSafeActionId
  };
}

function safeSection(
  section: OperatorStatusSectionDto,
  fallback: OperatorStatusSectionDto
): OperatorStatusSectionDto {
  const parsed = operatorStatusSectionSchema.safeParse(section);
  return parsed.success ? parsed.data : fallback;
}

function workspaceState(
  envelope: WorkspaceOpsEnvelope<WorkspaceVerifyDto>,
  payload: WorkspaceVerifyDto | undefined
): OperatorReadinessState {
  if (isUninitializedWorkspaceRoot(envelope, payload)) {
    return "action-required";
  }
  if (envelope.status === "blocked") {
    return "blocked";
  }
  if (payload === undefined) {
    return envelope.status === "ready" ? "ready" : "degraded";
  }
  if (payload.mountStatus.status !== "available") {
    return "blocked";
  }
  if (payload.manifest.readable && !payload.manifest.valid) {
    return "action-required";
  }
  if (
    !payload.manifest.readable ||
    !payload.layout.readable ||
    !payload.ledger.readable
  ) {
    return "blocked";
  }
  if (
    envelope.status === "degraded" ||
    !payload.blobStore.available ||
    payload.blobStore.missingBlobCount > 0 ||
    payload.blobStore.hashMismatchCount > 0 ||
    !payload.projections.available ||
    payload.projections.staleCount > 0 ||
    !payload.projections.rebuildable ||
    !payload.jobs.available ||
    payload.jobs.failedCount > 0 ||
    payload.diagnostics.errorCount > 0 ||
    payload.diagnostics.warningCount > 0
  ) {
    return "degraded";
  }
  return "ready";
}

function workspaceNextSafeActionIds(
  envelope: WorkspaceOpsEnvelope<WorkspaceVerifyDto>,
  payload: WorkspaceVerifyDto | undefined,
  state: OperatorReadinessState
): string[] {
  if (state === "ready") {
    return ["action_refresh_operator_status"];
  }

  if (isUninitializedWorkspaceRoot(envelope, payload)) {
    return ["action_show_workspace_create", "action_show_workspace_verify", "action_refresh_operator_status"];
  }

  if (payload?.mountStatus.status === "wrong-drive") {
    return ["action_show_workspace_select_mount", "action_show_workspace_detect_drive", "action_refresh_operator_status"];
  }

  if (payload?.mountStatus.status !== undefined && payload.mountStatus.status !== "available") {
    return ["action_show_workspace_detect_drive", "action_refresh_operator_status"];
  }

  if (payload?.manifest.readable === true && payload.manifest.valid === false) {
    return ["action_show_workspace_create", "action_show_workspace_verify", "action_refresh_operator_status"];
  }

  if (
    payload?.projections.available === true &&
    payload.projections.rebuildable &&
    payload.projections.staleCount > 0
  ) {
    return ["action_show_projection_rebuild_readiness", "action_refresh_operator_status"];
  }

  if (
    envelope.diagnostics.some((diagnostic) =>
      diagnostic.repairHint.allowedNextCommands.includes("projection rebuild-readiness")
    )
  ) {
    return ["action_show_projection_rebuild_readiness", "action_refresh_operator_status"];
  }

  return ["action_show_workspace_verify", "action_refresh_operator_status"];
}

function isUninitializedWorkspaceRoot(
  envelope: WorkspaceOpsEnvelope<WorkspaceVerifyDto>,
  payload: WorkspaceVerifyDto | undefined
): boolean {
  return (
    payload?.mountStatus.status === "wrong-drive" &&
    envelope.workspace === undefined &&
    envelope.diagnostics.some((diagnostic) => diagnostic.diagnosticId === "diag_workspace_manifest_missing")
  );
}

function workspaceSourceEvidence(
  envelope: WorkspaceOpsEnvelope<WorkspaceVerifyDto>,
  payload: WorkspaceVerifyDto | undefined
): OperatorSourceEvidenceDto {
  const refs: OperatorSourceEvidenceDto["refs"] = [
    ...(envelope.workspace === undefined
      ? []
      : [{ label: "workspaceId", value: safeMessage(envelope.workspace.workspaceId) }]),
    { label: "command", value: envelope.command },
    { label: "schemaVersion", value: envelope.schemaVersion },
    ...(payload?.mountStatus.status === undefined
      ? []
      : [{ label: "mountStatus", value: payload.mountStatus.status }]),
    ...(payload?.mountStatus.expectedRootUri === undefined
      ? []
      : [{ label: "expectedRootUri", value: safeMessage(payload.mountStatus.expectedRootUri) }]),
    ...envelope.diagnostics.flatMap((diagnostic) =>
      diagnostic.relatedIds.map((relatedId) => ({ label: "identityRef", value: safeMessage(relatedId) }))
    )
  ];

  return sourceEvidence("src_workspace_verify", "workspace-ops.v1", "workspace-ops", "verify workspace", refs);
}

function ingestionState(
  workspace: IngestionWorkspaceDto,
  diagnostics: readonly IngestionRuntimeDiagnosticDto[],
  failedJobs: number
): OperatorReadinessState {
  if (!workspace.mounted) {
    return "blocked";
  }
  if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    return "blocked";
  }
  if (workspace.review?.approvalRequired === true) {
    return "action-required";
  }
  if (failedJobs > 0 || diagnostics.some((diagnostic) => diagnostic.severity === "warning")) {
    return "degraded";
  }
  return "ready";
}

function agentState(agent: AgentStatusDto): OperatorReadinessState {
  if (
    agent.identityLifecycle.state === "blocked" ||
    agent.identityLifecycle.state === "not-mounted"
  ) {
    return "blocked";
  }
  if (
    agent.diagnostics.some((diagnostic) => diagnostic.severity === "error") ||
    hasBlockingAgentLock(agent)
  ) {
    return "blocked";
  }
  if (agent.pendingApprovalCount > 0) {
    return "action-required";
  }
  if (agent.diagnostics.some((diagnostic) => diagnostic.severity === "warning")) {
    return "degraded";
  }
  return "ready";
}

function hasBlockingAgentLock(agent: AgentStatusDto): boolean {
  return agent.locks.some((lock) =>
    lock.state === "active" &&
    (
      lock.kind === "legal-escalation" ||
      lock.kind === "export" ||
      lock.kind === "secret" ||
      lock.kind === "data-loss"
    )
  );
}

function headlineForAgent(agent: AgentStatusDto, state: OperatorReadinessState): string {
  if (agent.identityLifecycle.state === "blocked") {
    return "Resident identity requires attention";
  }
  if (agent.identityLifecycle.state === "not-mounted") {
    return "Resident workspace is not mounted";
  }
  if (hasBlockingAgentLock(agent)) {
    return "Agent lock is active";
  }
  if (agent.diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    return "Agent diagnostics require attention";
  }
  if (state === "action-required") {
    return "Agent approvals pending";
  }
  if (state === "degraded") {
    return "Agent status degraded";
  }
  return "Agent runtime ready";
}

function headlineForWorkspace(
  envelope: WorkspaceOpsEnvelope<WorkspaceVerifyDto>,
  payload: WorkspaceVerifyDto | undefined
): string {
  if (payload?.mountStatus.status !== undefined && payload.mountStatus.status !== "available") {
    return "Workspace mount requires attention";
  }
  if (envelope.workspace !== undefined) {
    return "Mounted portable workspace";
  }
  return envelope.status === "ready" ? "Workspace verification ready" : "Workspace verification requires attention";
}

function summaryForWorkspace(
  envelope: WorkspaceOpsEnvelope<WorkspaceVerifyDto>,
  payload: WorkspaceVerifyDto | undefined
): string {
  if (payload === undefined) {
    return envelope.status === "ready"
      ? "Workspace ops returned a ready envelope."
      : "Workspace ops returned a non-ready envelope.";
  }
  return payload.mountStatus.safeMessage;
}

function workspaceDiagnostics(
  diagnostics: readonly WorkspaceDiagnosticDto[]
): OperatorDiagnosticDto[] {
  return diagnostics.map((diagnostic, index) => ({
    diagnosticId: safeDiagnosticId(diagnostic.diagnosticId, "workspace", index),
    severity: diagnostic.severity,
    category: "workspace",
    message: safeMessage(diagnostic.message),
    refs: diagnostic.relatedIds.map((relatedId) => ({ label: "relatedId", value: safeMessage(relatedId) }))
  }));
}

function ingestionDiagnostics(
  diagnostics: readonly IngestionRuntimeDiagnosticDto[]
): OperatorDiagnosticDto[] {
  return diagnostics.map((diagnostic, index) => ({
    diagnosticId: safeDiagnosticId(diagnostic.diagnosticId, "ingestion", index),
    severity: diagnostic.severity,
    category: "ingestion",
    message: safeMessage(diagnostic.message),
    refs: []
  }));
}

function agentDiagnostics(
  diagnostics: readonly AgentRuntimeDiagnosticDto[]
): OperatorDiagnosticDto[] {
  return diagnostics.map((diagnostic, index) => ({
    diagnosticId: safeDiagnosticId(diagnostic.diagnosticId, "agent", index),
    severity: diagnostic.severity,
    category: "agent",
    message: safeMessage(diagnostic.message),
    refs: (diagnostic.allowedRepairActions ?? []).slice(0, 3).map((action) => ({
      label: "allowedRepairAction",
      value: safeMessage(action)
    }))
  }));
}

function identityLifecycleDiagnostics(agent: AgentStatusDto): OperatorDiagnosticDto[] {
  if (agent.identityLifecycle.state !== "blocked") {
    return [];
  }

  return [{
    diagnosticId: "diag_agent_identity_lifecycle_blocked",
    severity: "error",
    category: "agent",
    message: safeMessage(agent.identityLifecycle.safeMessage),
    refs: agent.identityLifecycle.allowedRepairActions.slice(0, 3).map((action) => ({
      label: "allowedRepairAction",
      value: safeMessage(action)
    }))
  }];
}

function prrDiagnostics(
  diagnostics: OperatorPrrStatusProviderDto["diagnostics"]
): OperatorDiagnosticDto[] {
  return diagnostics.map((diagnostic, index) => ({
    diagnosticId: safeDiagnosticId(diagnostic.diagnosticId, "prr", index),
    severity: "warning",
    category: "prr",
    message: safeMessage(diagnostic.message),
    refs: [{ label: "prrRequestId", value: safeMessage(diagnostic.prrRequestId) }]
  }));
}

function legacyDiagnostics(
  legacy: LegacyMigrationReviewDto,
  samplesStillNeeded: boolean
): OperatorDiagnosticDto[] {
  const diagnostics: OperatorDiagnosticDto[] = legacy.diagnostics.map((diagnostic, index) => ({
    diagnosticId: safeDiagnosticId(diagnostic.diagnosticId, "legacy", index),
    severity: diagnostic.severity,
    category: "legacy-import",
    message: safeMessage(diagnostic.message),
    refs: []
  }));

  if (samplesStillNeeded) {
    diagnostics.push({
      diagnosticId: "diag_legacy_samples_needed",
      severity: "warning",
      category: "legacy-import",
      message: safeMessage(`Legacy samples needed: ${legacy.firstArtifactAsk[0] ?? "legacy artifact sample"}`),
      refs: []
    });
  }

  if (legacy.rawImportRequiresApproval) {
    diagnostics.push({
      diagnosticId: "diag_legacy_raw_import_approval_required",
      severity: "warning",
      category: "legacy-import",
      message: "Legacy raw import approval required before evidence copy.",
      refs: [
        { label: "sourceCollectionId", value: safeMessage(legacy.sourceCollectionId) },
        ...(legacy.latestReportId === undefined
          ? []
          : [{ label: "legacyReportId", value: safeMessage(legacy.latestReportId) }])
      ]
    });
  }

  return diagnostics;
}

function legacyNextSafeActionIds(
  legacy: LegacyMigrationReviewDto,
  state: OperatorReadinessState,
  samplesStillNeeded: boolean
): string[] {
  if (state === "ready") {
    return ["action_refresh_operator_status"];
  }

  if (legacy.rawImportRequiresApproval) {
    return ["action_open_ingestion", "action_show_legacy_import_help", "action_refresh_operator_status"];
  }

  if (samplesStillNeeded) {
    return ["action_show_legacy_import_help", "action_open_ingestion", "action_refresh_operator_status"];
  }

  return ["action_show_legacy_import_help", "action_open_ingestion"];
}

function reviewDiagnostics(
  review: IngestionWorkspaceDto["review"] | undefined
): readonly IngestionRuntimeDiagnosticDto[] {
  return review?.diagnostics.map((diagnostic) => ({
    diagnosticId: diagnostic.diagnosticId,
    severity: diagnostic.severity,
    category: diagnostic.category,
    message: diagnostic.message
  })) ?? [];
}

function unavailableSection(
  sectionId: OperatorStatusSectionDto["sectionId"],
  label: string,
  sourceContract: string
): OperatorStatusSectionDto {
  return {
    sectionId,
    label,
    state: "unavailable",
    headline: `${label} status unavailable`,
    safeSummary: "The status provider could not return a safe DTO.",
    metrics: [],
    diagnostics: [
      {
        diagnosticId: `diag_${sectionId.replace(/-/g, "_")}_provider_unavailable`,
        severity: "error",
        category: sectionId === "legacy-import" ? "legacy-import" : sectionId,
        message: "Status provider failed before returning a safe DTO.",
        refs: []
      }
    ],
    sourceEvidence: [
      sourceEvidence(`src_${sectionId.replace(/-/g, "_")}_provider`, sourceContract, "operator-status", `${label} provider`, [])
    ],
    nextSafeActionIds: ["action_refresh_operator_status"]
  };
}

function runtimeUnavailableSections(): OperatorStatusSectionDto[] {
  return [
    runtimeUnavailableSection("workspace", "Workspace"),
    runtimeUnavailableSection("ingestion", "Ingestion"),
    runtimeUnavailableSection("legacy-import", "Legacy Import"),
    runtimeUnavailableSection("prr", "PRR"),
    runtimeUnavailableSection("agent", "Agent")
  ];
}

function runtimeUnavailableSection(
  sectionId: OperatorStatusSectionDto["sectionId"],
  label: string
): OperatorStatusSectionDto {
  return {
    sectionId,
    label,
    state: "unavailable",
    headline: `${label} status unavailable`,
    safeSummary: "Local runtime is unavailable; no fallback workspace status is assumed.",
    metrics: [],
    diagnostics: [
      {
        diagnosticId: `diag_${sectionId.replace(/-/g, "_")}_runtime_unavailable`,
        severity: "error",
        category: "runtime",
        message: "Local runtime is unavailable; operator status sections cannot be trusted.",
        refs: []
      }
    ],
    sourceEvidence: [
      sourceEvidence(
        `src_${sectionId.replace(/-/g, "_")}_runtime_unavailable`,
        "local-runtime",
        "local-runtime",
        `${label} runtime availability`,
        []
      )
    ],
    nextSafeActionIds: ["action_refresh_operator_status"]
  };
}

function sourceEvidence(
  evidenceId: string,
  sourceContract: string,
  sourceKind: OperatorSourceEvidenceDto["sourceKind"],
  label: string,
  refs: OperatorSourceEvidenceDto["refs"]
): OperatorSourceEvidenceDto {
  return {
    evidenceId,
    sourceContract,
    sourceKind,
    label,
    refs
  };
}

function safeDiagnosticId(value: string | undefined, prefix: string, index: number): string {
  if (value !== undefined && /^diag_[a-zA-Z0-9_-]+$/.test(value) && isSecretSafe(value)) {
    return value;
  }
  return `diag_${prefix.replace(/-/g, "_")}_${index + 1}`;
}

function safeMessage(value: string): string {
  return isSecretSafe(value) ? value : "Provider text was withheld because it was not safe for operator status.";
}

function isSecretSafe(value: string): boolean {
  return !/(?:^|[^a-z0-9])(?:access[\s._-]*tokens?|api[\s._-]*keys?|auth[\s._-]*tokens?|authorization|bearer|tokens?|passwords?|private[\s._-]*keys?|client[\s._-]*secrets?|refresh[\s._-]*secrets?|session[\s._-]*secrets?|oauth|credentials?)(?:\s*[:=]\s*|\s+)(?=[a-z0-9._~+/=-]{3,})[a-z0-9][a-z0-9._~+/=-]*/i.test(value) &&
    !/\b(?:auth[\s._-]*tokens?|bearer(?:[\s._-]*tokens?)?|passwords?|private[\s._-]*keys?)\b/i.test(value) &&
    !/-----BEGIN [A-Z ]*PRIVATE KEY-----/i.test(value);
}
