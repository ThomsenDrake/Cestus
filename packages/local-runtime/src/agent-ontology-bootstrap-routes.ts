import { FileBlobStore } from "../../ontology/src/blob-store.js";
import type { ActorRef } from "../../ontology/src/contracts.js";
import type { EventLedger } from "../../ontology/src/event-ledger.js";
import {
  runOntologyBootstrapResidentWorkflow,
  type OntologyBootstrapAgentReviewBundle
} from "../../agent/src/index.js";
import { buildIngestionProjection } from "../../ingestion/src/projection.js";
import {
  createLegacyImportRuntime,
  type LegacyReportData
} from "../../ingestion/src/legacy-runtime.js";
import {
  mountedWorkspaceCapabilities,
  type MountedWorkspace
} from "../../ingestion/src/mount-contract.js";
import type { OntologyBootstrapEvidenceLink } from "../../ontology-bootstrap/src/dossier-builder.js";
import { buildTaskAttemptId } from "../../agent/src/task-orchestrator-events.js";
import type { LocalRuntimeRequest, LocalRuntimeResponse } from "./http-handler.js";
import type { LocalAgentRuntimeFactory } from "./agent-runtime-factory.js";
import type { LocalRuntimeHandle } from "./runtime-factory.js";
import {
  consumeMountedHandoffAuthorityController,
  preflightPortableMountedAgentHandoffBinding,
  type FactoryPortableMountedAgentHandoffProducerResultV1
} from "./portable-mounted-agent-artifact-stores.js";

const routeSchemaVersion = "agent-ontology-bootstrap-route.v1" as const;
const residentAgentId = "agent_default";
const residentAgentActor = { id: residentAgentId, kind: "agent" as const, label: "Cestus Agent" };

export interface HandleAgentOntologyBootstrapRouteInput {
  readonly request: LocalRuntimeRequest;
  readonly handle: LocalRuntimeHandle;
  readonly actor: ActorRef;
  readonly now: () => string;
  readonly runtime: ReturnType<LocalAgentRuntimeFactory>;
}

export async function handleAgentOntologyBootstrapRoute(
  input: HandleAgentOntologyBootstrapRouteInput
): Promise<LocalRuntimeResponse | undefined> {
  const url = new URL(input.request.url, "http://localhost");
  const path = url.pathname;

  if (input.request.method === "POST" && path === "/api/agent/specialists/ontology-bootstrap/runs") {
    const payload = parseJsonObjectBody(input.request.body);
    if (!payload.ok) {
      return json(400, payload.body);
    }

    const launchInput = launchInputFromBody(payload.value);
    if (launchInput === undefined) {
      return json(400, invalidLaunchBodyDiagnostic());
    }

    return await launchOntologyBootstrapRun(input, launchInput);
  }

  const readMatch = path.match(/^\/api\/agent\/specialists\/ontology-bootstrap\/runs\/([^/]+)$/);
  if (input.request.method === "GET" && readMatch !== null) {
    const runId = decodeURIComponent(readMatch[1] ?? "");
    if (!isAgentRunId(runId)) {
      return json(400, invalidRunIdDiagnostic());
    }
    return await readOntologyBootstrapRun(input, runId);
  }

  return undefined;
}

interface LaunchInput {
  readonly taskId: string;
  readonly runId: string;
  readonly sourceCollectionId: string;
  readonly sourceRoot: string;
  readonly scanBatchId: string;
  readonly importBatchId: string;
  readonly stagingBatchId?: string;
  readonly selectedCandidateIds: readonly string[];
  readonly maxCandidatesPerBundle?: number;
}

interface RuntimeMountedOntologyBootstrapHandoff {
  readonly binding: FactoryPortableMountedAgentHandoffProducerResultV1["binding"];
  readonly controller: FactoryPortableMountedAgentHandoffProducerResultV1["controller"];
  stop(): Promise<void>;
}

type RuntimeMountedOntologyBootstrapHandoffAcquirer = (input: {
    readonly taskId: string;
    readonly runId: string;
    readonly attemptId: `attempt_${string}`;
    readonly runType: "ontology-bootstrap";
    readonly retryGeneration: 0;
  }) => Promise<unknown>;

async function launchOntologyBootstrapRun(
  input: HandleAgentOntologyBootstrapRouteInput,
  launchInput: LaunchInput
): Promise<LocalRuntimeResponse> {
  const mountedWorkspace = mountedWorkspaceFromHandle(input.handle);
  if (mountedWorkspace === undefined) {
    return json(503, diagnostic("Ontology bootstrap requires a mounted portable workspace.", [
      "configure local runtime storage as portable-workspace",
      "retry ontology bootstrap launch"
    ]));
  }

  const mountedHandoff = await mountedOntologyBootstrapHandoff(input, launchInput);
  if (!mountedHandoff.ok) return json(503, mountedHandoff.body);

  try {
    try {
      await preflightPortableMountedAgentHandoffBinding({
        binding: mountedHandoff.binding,
        controller: mountedHandoff.controller,
        taskId: launchInput.taskId,
        attemptId: buildTaskAttemptId({
          taskId: launchInput.taskId,
          runType: "ontology-bootstrap",
          retryGeneration: 0
        }),
        runId: launchInput.runId,
        runType: "ontology-bootstrap",
        retryGeneration: 0
      });
    } catch {
      return json(503, diagnostic("Ontology bootstrap mounted authority is unavailable or no longer current.", [
        "restore the mounted workspace and retry the ontology bootstrap launch"
      ]));
    }

    const initialized = await input.runtime.initializeDefaultIdentity({
      workspaceId: mountedWorkspace.workspaceId,
      initializedBy: input.actor.id
    });
    if (!initialized.ok) {
      return json(500, diagnostic("Agent identity could not be initialized.", [
        "inspect the local agent runtime configuration"
      ]));
    }

    const taskReady = await ensureTask(input, launchInput.taskId);
    if (!taskReady.ok) {
      return json(500, taskReady.body);
    }

    const legacyRuntime = createLegacyImportRuntime({
      mountedWorkspace,
      actor: input.actor
    });
    const inspected = await legacyRuntime.inspect({
      sourceCollectionId: launchInput.sourceCollectionId,
      label: "Old Cestus archive",
      sourceRoot: launchInput.sourceRoot,
      scanBatchId: launchInput.scanBatchId
    });
    if (!inspected.ok) {
      return json(500, legacyFailureDiagnostic(inspected.error.message, inspected.error.allowedRepairActions));
    }

    const report = await legacyRuntime.report({
      sourceCollectionId: launchInput.sourceCollectionId,
      legacyReportId: inspected.legacyReportId
    });
    if (!report.ok) {
      return json(500, legacyFailureDiagnostic(report.error.message, report.error.allowedRepairActions));
    }

    const reportEventId = await canonicalReportEventId(input.handle.ledger, report);
    if (reportEventId === undefined) {
      return json(500, diagnostic("Ontology bootstrap requires one exact canonical staged report ledger binding.", [
        "rerun legacy inspection and verify the staged report event"
      ]));
    }

    const runReady = await ensureRun(input, launchInput, report, reportEventId);
    if (!runReady.ok) {
      return json(500, runReady.body);
    }

    let result: Awaited<ReturnType<typeof runOntologyBootstrapResidentWorkflow>>;
    try {
      const evidenceLinks = await evidenceLinksForSource(input.handle.ledger, launchInput.sourceCollectionId);
      const selectedCandidateIds = evidenceBackedSelection(report, evidenceLinks, launchInput.selectedCandidateIds);
      result = await runOntologyBootstrapResidentWorkflow({
        ledger: input.handle.ledger,
        actor: residentAgentActor,
        residentAgentId,
        runId: launchInput.runId,
        taskId: launchInput.taskId,
        sourceCollectionId: launchInput.sourceCollectionId,
        stagedReport: {
          sourceCollectionId: report.report.sourceCollectionId,
          scanBatchId: report.report.scanBatchId,
          legacyReportId: report.report.legacyReportId,
          reportHash: report.report.reportHash
        },
        reportEventId,
        derivativeStore: mountedWorkspace.derivativeStore,
        handoffMaterialStore: mountedHandoff.binding.materialStore,
        handoffManifestStore: mountedHandoff.binding.manifestStore,
        handoffAuthorityWitness: mountedHandoff.binding.authorityWitness,
        review: report.review,
        evidenceLinks,
        selectedCandidateIds,
        importBatchId: launchInput.importBatchId,
        ...(launchInput.stagingBatchId === undefined ? {} : { stagingBatchId: launchInput.stagingBatchId }),
        ...(launchInput.maxCandidatesPerBundle === undefined ? {} : {
          maxCandidatesPerBundle: launchInput.maxCandidatesPerBundle
        }),
        now: input.now
      });

      if (!result.ok) {
        return json(500, diagnostic(result.message, ["inspect ontology bootstrap agent diagnostics"]));
      }
      if (result.handoffEventIds.length > 0) {
        await consumeMountedHandoffAuthorityController(mountedHandoff.controller, result.handoffEventIds);
      }
    } catch {
      return json(503, diagnostic("Ontology bootstrap mounted authority is unavailable or no longer current.", [
        "restore the mounted workspace and retry the ontology bootstrap launch"
      ]));
    }

    if (!result.ok) {
      return json(500, diagnostic("Ontology bootstrap handoff did not complete safely.", ["inspect ontology bootstrap agent diagnostics"]));
    }
    const evidenceLinks = await evidenceLinksForSource(input.handle.ledger, launchInput.sourceCollectionId);
    const selectedCandidateIds = evidenceBackedSelection(report, evidenceLinks, launchInput.selectedCandidateIds);

    return json(200, routeDto({
      generatedAt: input.now(),
      taskId: launchInput.taskId,
      runId: launchInput.runId,
      reviewBundle: result.reviewBundle,
      reviewBundleHash: result.reviewBundleHash,
      pendingApprovalToolRequestIds: result.pendingApprovalToolRequestIds,
      requestedCandidateIds: launchInput.selectedCandidateIds,
      selectedCandidateIds
    }));
  } finally {
    await mountedHandoff.stop().catch(() => undefined);
  }
}

async function mountedOntologyBootstrapHandoff(
  input: HandleAgentOntologyBootstrapRouteInput,
  launchInput: LaunchInput
): Promise<
  | ({ readonly ok: true } & RuntimeMountedOntologyBootstrapHandoff)
  | { readonly ok: false; readonly body: unknown }
> {
  const acquire = mountedOntologyBootstrapHandoffAcquirer(input.runtime);
  if (acquire === undefined) {
    return {
      ok: false,
      body: diagnostic("Ontology bootstrap requires a current mounted authority lifecycle from runtime composition.", [
        "restore the mounted workspace and retry the ontology bootstrap launch"
      ])
    };
  }
  try {
    const handoff = await acquire({
      taskId: launchInput.taskId,
      runId: launchInput.runId,
      attemptId: buildTaskAttemptId({
        taskId: launchInput.taskId,
        runType: "ontology-bootstrap",
        retryGeneration: 0
      }),
      runType: "ontology-bootstrap",
      retryGeneration: 0
    });
    if (!isRuntimeMountedOntologyBootstrapHandoff(handoff)) throw new Error("invalid mounted handoff");
    return Object.freeze({ ok: true as const, ...handoff });
  } catch {
    return {
      ok: false,
      body: diagnostic("Ontology bootstrap requires a current mounted authority lifecycle.", [
        "restore the mounted workspace and retry the ontology bootstrap launch"
      ])
    };
  }
}

function mountedOntologyBootstrapHandoffAcquirer(
  runtime: unknown
): RuntimeMountedOntologyBootstrapHandoffAcquirer | undefined {
  const candidate = ownDataProperty(runtime, "acquireMountedOntologyBootstrapHandoff");
  return isRuntimeMountedOntologyBootstrapHandoffAcquirer(candidate) ? candidate : undefined;
}

function isRuntimeMountedOntologyBootstrapHandoffAcquirer(
  value: unknown
): value is RuntimeMountedOntologyBootstrapHandoffAcquirer {
  return typeof value === "function";
}

function isRuntimeMountedOntologyBootstrapHandoff(
  value: unknown
): value is RuntimeMountedOntologyBootstrapHandoff {
  return isObject(ownDataProperty(value, "binding")) &&
    isObject(ownDataProperty(value, "controller")) &&
    isStop(value);
}

function isStop(value: unknown): value is { readonly stop: () => Promise<void> } {
  return typeof ownDataProperty(value, "stop") === "function";
}

function ownDataProperty(value: unknown, key: string): unknown | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && "value" in descriptor ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

async function canonicalReportEventId(
  ledger: EventLedger,
  report: LegacyReportData
): Promise<string | undefined> {
  const matches = (await ledger.readAll()).filter((event) =>
    event.type === "legacy.import.report.generated" &&
    event.payload.legacyReportId === report.report.legacyReportId &&
    event.payload.sourceCollectionId === report.report.sourceCollectionId &&
    event.payload.scanBatchId === report.report.scanBatchId &&
    event.payload.reportHash === report.report.reportHash &&
    event.payload.candidateSetHash === report.report.candidateSetHash
  );
  return matches.length === 1 ? matches[0]?.id : undefined;
}

async function readOntologyBootstrapRun(
  input: HandleAgentOntologyBootstrapRouteInput,
  runId: string
): Promise<LocalRuntimeResponse> {
  const status = await input.runtime.status();
  const run = status.runs.find((candidate) => candidate.runId === runId);
  if (run === undefined) {
    return json(404, diagnostic("Ontology bootstrap run was not found.", [
      "launch the ontology bootstrap specialist run",
      "refresh agent status"
    ]));
  }

  const pendingApprovalToolRequestIds = status.toolRequests
    .filter((request) => request.runId === runId && request.state === "requested")
    .map((request) => request.toolRequestId)
    .sort(compareCodeUnits);

  return json(200, {
    schemaVersion: routeSchemaVersion,
    generatedAt: status.generatedAt,
    runId: run.runId,
    ...(run.taskId === undefined ? {} : { taskId: run.taskId }),
    runState: run.state,
    reviewBundleHash: run.outputArtifactHashes[0],
    pendingApprovalToolRequestIds,
    outputArtifactHashes: run.outputArtifactHashes,
    stepIds: run.stepIds,
    nextSafeAction: pendingApprovalToolRequestIds.length > 0
      ? { kind: "review", label: "Review pending ontology bootstrap tool request", effect: "ledger-review" }
      : { kind: "review", label: "Inspect ontology bootstrap run output hashes", effect: "none" }
  });
}

function routeDto(input: {
  readonly generatedAt: string;
  readonly taskId: string;
  readonly runId: string;
  readonly reviewBundle: OntologyBootstrapAgentReviewBundle;
  readonly reviewBundleHash: `sha256:${string}`;
  readonly pendingApprovalToolRequestIds: readonly string[];
  readonly requestedCandidateIds: readonly string[];
  readonly selectedCandidateIds: readonly string[];
}) {
  const nextCursorBundle = input.reviewBundle.candidateBundles.find(
    (bundle) => bundle.cursor.nextOffset !== undefined
  );
  const blockedRequestedCandidateIds = input.requestedCandidateIds
    .filter((candidateId) => !input.selectedCandidateIds.includes(candidateId))
    .sort(compareCodeUnits);

  return {
    schemaVersion: routeSchemaVersion,
    generatedAt: input.generatedAt,
    runId: input.runId,
    taskId: input.taskId,
    phase: input.reviewBundle.dossier.phase,
    legacyReportId: input.reviewBundle.dossier.legacyReportId,
    reportHash: input.reviewBundle.dossier.reportHash,
    candidateSetHash: input.reviewBundle.dossier.candidateSetHash,
    reviewBundleHash: input.reviewBundleHash,
    candidateBundleCount: input.reviewBundle.candidateBundles.length,
    candidateCount: input.reviewBundle.candidateBundles.reduce((total, bundle) => total + bundle.candidateCount, 0),
    selectedCandidateIds: [...input.selectedCandidateIds],
    blockedRequestedCandidateIds,
    pendingApprovalToolRequestIds: [...input.pendingApprovalToolRequestIds],
    nextCursor: nextCursorBundle?.cursor,
    nextSafeAction: input.reviewBundle.nextSafeAction
  };
}

async function ensureTask(
  input: HandleAgentOntologyBootstrapRouteInput,
  taskId: string
): Promise<{ readonly ok: true } | { readonly ok: false; readonly body: unknown }> {
  const status = await input.runtime.status();
  if (status.tasks.some((task) => task.taskId === taskId)) {
    return { ok: true };
  }

  const created = await input.runtime.createTask({
    taskId,
    title: "Bootstrap old Cestus archive",
    requestedBy: input.actor.id,
    priority: "normal"
  });
  if (created.ok) {
    return { ok: true };
  }
  return {
    ok: false,
    body: diagnostic("Agent task could not be created.", ["inspect agent diagnostics"])
  };
}

async function ensureRun(
  input: HandleAgentOntologyBootstrapRouteInput,
  launchInput: LaunchInput,
  report: LegacyReportData,
  reportEventId: string
): Promise<{ readonly ok: true } | { readonly ok: false; readonly body: unknown }> {
  const status = await input.runtime.status();
  const existing = status.runs.find((run) => run.runId === launchInput.runId);
  if (existing !== undefined) {
    if (existing.runType !== "ontology-bootstrap" || !isExactOntologyBootstrapRunProvenance({
      sourceEventIds: existing.sourceEventIds,
      inputArtifactHashes: existing.inputArtifactHashes,
      reportEventId,
      reportHash: report.reportHash,
      candidateSetHash: report.candidateSetHash
    })) {
      return {
        ok: false,
        body: diagnostic("Existing ontology bootstrap run is not bound to the exact canonical staged report.", [
          "start a new run with the current canonical staged report"
        ])
      };
    }
    return { ok: true };
  }

  const started = await input.runtime.startRun({
    runId: launchInput.runId,
    taskId: launchInput.taskId,
    runType: "ontology-bootstrap",
    scope: {
      kind: "workspace",
      refs: [input.handle.mountedWorkspace?.workspaceId ?? "ws_local_runtime"]
    },
    sourceEventIds: [reportEventId],
    inputArtifactHashes: [report.reportHash, report.candidateSetHash]
  });
  if (started.ok) {
    return { ok: true };
  }
  return {
    ok: false,
    body: diagnostic("Ontology bootstrap run could not be started.", ["inspect agent diagnostics"])
  };
}

export function isExactOntologyBootstrapRunProvenance(input: {
  readonly sourceEventIds: readonly string[];
  readonly inputArtifactHashes: readonly string[];
  readonly reportEventId: string;
  readonly reportHash: string;
  readonly candidateSetHash: string;
}): boolean {
  return sameExactStringSet(input.sourceEventIds, [input.reportEventId]) &&
    sameExactStringSet(input.inputArtifactHashes, [input.reportHash, input.candidateSetHash]);
}

function sameExactStringSet(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length &&
    new Set(actual).size === actual.length &&
    actual.every((value) => expected.includes(value));
}

function mountedWorkspaceFromHandle(handle: LocalRuntimeHandle): MountedWorkspace | undefined {
  const mounted = handle.mountedWorkspace;
  if (mounted === undefined) {
    return undefined;
  }

  return {
    workspaceId: mounted.workspaceId,
    label: mounted.label,
    ledger: handle.ledger,
    blobStore: new FileBlobStore(mounted.paths.blobRoot),
    derivativeStore: new FileBlobStore(mounted.paths.derivativeRoot),
    jobStateRoot: mounted.paths.jobRoot,
    diagnosticsRoot: mounted.paths.cacheRoot,
    projectionCacheRoot: mounted.paths.projectionRoot,
    capabilities: mountedWorkspaceCapabilities({
      canReadLedger: true,
      canAppendLedger: true,
      canWriteBlobs: true,
      canWriteDerivatives: true,
      canWriteJobState: true
    })
  };
}

async function evidenceLinksForSource(
  ledger: EventLedger,
  sourceCollectionId: string
): Promise<readonly OntologyBootstrapEvidenceLink[]> {
  const projection = buildIngestionProjection(await ledger.readAll());
  return [...projection.evidenceLinks.values()]
    .filter((link) => link.sourceCollectionId === sourceCollectionId)
    .map((link) => ({
      sourceCollectionId: link.sourceCollectionId,
      evidenceId: link.evidenceId,
      contentHash: link.contentHash as `sha256:${string}`,
      occurrenceIds: [...link.occurrenceIds].sort(compareCodeUnits)
    }))
    .sort((left, right) => compareCodeUnits(left.contentHash, right.contentHash));
}

function evidenceBackedSelection(
  report: LegacyReportData,
  evidenceLinks: readonly OntologyBootstrapEvidenceLink[],
  selectedCandidateIds: readonly string[]
): readonly string[] {
  const evidenceHashes = new Set(evidenceLinks.map((link) => link.contentHash));
  const evidenceBackedCandidateIds = new Set(
    report.report.proposedAssertionCandidates
      .filter((candidate) => evidenceHashes.has(candidate.evidenceContentHash))
      .map((candidate) => candidate.candidateId)
  );
  return selectedCandidateIds
    .filter((candidateId) => evidenceBackedCandidateIds.has(candidateId))
    .sort(compareCodeUnits);
}

function launchInputFromBody(value: Record<string, unknown>): LaunchInput | undefined {
  if (!hasOnlyKeys(value, [
    "taskId",
    "runId",
    "sourceCollectionId",
    "sourceRoot",
    "scanBatchId",
    "importBatchId",
    "stagingBatchId",
    "selectedCandidateIds",
    "maxCandidatesPerBundle"
  ])) {
    return undefined;
  }

  if (
    !isAgentTaskId(value.taskId) ||
    !isAgentRunId(value.runId) ||
    !isSourceCollectionId(value.sourceCollectionId) ||
    !isNonEmptyString(value.sourceRoot) ||
    !isScanBatchId(value.scanBatchId) ||
    !isImportBatchId(value.importBatchId) ||
    (value.stagingBatchId !== undefined && !isStagingBatchId(value.stagingBatchId)) ||
    !isCandidateIdArray(value.selectedCandidateIds) ||
    (value.maxCandidatesPerBundle !== undefined && !isCandidateLimit(value.maxCandidatesPerBundle))
  ) {
    return undefined;
  }

  return {
    taskId: value.taskId,
    runId: value.runId,
    sourceCollectionId: value.sourceCollectionId,
    sourceRoot: value.sourceRoot,
    scanBatchId: value.scanBatchId,
    importBatchId: value.importBatchId,
    ...(value.stagingBatchId === undefined ? {} : { stagingBatchId: value.stagingBatchId }),
    selectedCandidateIds: value.selectedCandidateIds,
    ...(value.maxCandidatesPerBundle === undefined ? {} : {
      maxCandidatesPerBundle: value.maxCandidatesPerBundle
    })
  };
}

function parseJsonObjectBody(
  body: string | undefined
):
  | { readonly ok: true; readonly value: Record<string, unknown> }
  | { readonly ok: false; readonly body: unknown } {
  try {
    const value = body === undefined || body.trim() === "" ? {} : JSON.parse(body);
    if (!isJsonObject(value)) {
      return { ok: false, body: invalidLaunchBodyDiagnostic() };
    }
    return { ok: true, value };
  } catch {
    return {
      ok: false,
      body: diagnostic("Ontology bootstrap request body must be valid JSON.", ["send a valid JSON request body"])
    };
  }
}

function invalidLaunchBodyDiagnostic() {
  return diagnostic("Ontology bootstrap launch body is invalid.", [
    "send taskId, runId, sourceCollectionId, sourceRoot, scanBatchId, importBatchId, selectedCandidateIds, and optional maxCandidatesPerBundle"
  ]);
}

function invalidRunIdDiagnostic() {
  return diagnostic("Ontology bootstrap run id is invalid.", ["use a run_ id in the route path"]);
}

function legacyFailureDiagnostic(message: string, allowedRepairActions: readonly string[]) {
  return diagnostic(message, allowedRepairActions);
}

function diagnostic(message: string, allowedRepairActions: readonly string[]) {
  return Object.freeze({
    ok: false,
    diagnostic: Object.freeze({
      message,
      allowedRepairActions: Object.freeze([...allowedRepairActions])
    })
  });
}

function json(status: number, body: unknown): LocalRuntimeResponse {
  return Object.freeze({
    status,
    headers: Object.freeze({ "content-type": "application/json; charset=utf-8" }),
    body: JSON.stringify(body)
  });
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isAgentTaskId(value: unknown): value is string {
  return typeof value === "string" && /^task_[a-zA-Z0-9_-]+$/.test(value);
}

function isAgentRunId(value: unknown): value is string {
  return typeof value === "string" && /^run_[a-zA-Z0-9_-]+$/.test(value);
}

function isSourceCollectionId(value: unknown): value is string {
  return typeof value === "string" && /^src_[a-zA-Z0-9_-]+$/.test(value);
}

function isScanBatchId(value: unknown): value is string {
  return typeof value === "string" && /^scan_[a-zA-Z0-9_-]+$/.test(value);
}

function isImportBatchId(value: unknown): value is string {
  return typeof value === "string" && /^imp_[a-zA-Z0-9_-]+$/.test(value);
}

function isStagingBatchId(value: unknown): value is string {
  return typeof value === "string" && /^legacy_stage_[a-zA-Z0-9_-]+$/.test(value);
}

function isCandidateIdArray(value: unknown): value is string[] {
  return Array.isArray(value) &&
    value.every((item) => typeof item === "string" && /^legacy_candidate_[a-zA-Z0-9_-]+$/.test(item));
}

function isCandidateLimit(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 500;
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
