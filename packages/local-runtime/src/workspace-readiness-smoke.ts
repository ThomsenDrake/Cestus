import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createIngestionRuntime } from "../../ingestion/src/runtime.js";
import { mountedWorkspaceCapabilities, type MountedWorkspace } from "../../ingestion/src/mount-contract.js";
import { FileBlobStore } from "../../ontology/src/blob-store.js";
import type { KnowledgeEvent } from "../../ontology/src/contracts.js";
import { SQLiteEventLedger } from "../../ontology/src/sqlite-event-ledger.js";
import { checkBackupManifest, exportWorkspaceManifest } from "../../workspace-ops/src/backup.js";
import type {
  DiskUsageDto,
  ProposedRepairActionDto,
  WorkspaceDiagnosticDto
} from "../../workspace-ops/src/contracts.js";
import { NodeWorkspaceFileSystem } from "../../workspace-ops/src/filesystem.js";
import {
  resolveWorkspaceLayout,
  type ResolvedWorkspaceLayout,
  type WorkspaceLayoutResult
} from "../../workspace-ops/src/layout.js";
import { reportDiskUsage, verifyWorkspace } from "../../workspace-ops/src/ops.js";
import {
  createPortableWorkspace,
  mountPortableWorkspace,
  type MountedPortableWorkspace
} from "../../workspace/src/index.js";

export const localWorkspaceReadinessSmokeSchemaVersion = "local-workspace-readiness-smoke.v1" as const;

type ReadinessStatus = "ready" | "degraded" | "blocked";

export interface RunLocalWorkspaceReadinessSmokeInput {
  readonly workspaceRoot?: string;
  readonly sourceRoot?: string;
  readonly workspaceId?: string;
  readonly workspaceLabel?: string;
  readonly sourceCollectionId?: string;
  readonly sourceLabel?: string;
  readonly scanBatchId?: string;
  readonly importBatchId?: string;
  readonly approvedBy?: string;
  readonly now?: () => string;
}

export interface LocalWorkspaceReadinessCheck {
  readonly checkId: string;
  readonly ok: boolean;
  readonly status: ReadinessStatus;
  readonly summary: string;
}

export interface LocalWorkspaceReadinessSmokeReport {
  readonly schemaVersion: typeof localWorkspaceReadinessSmokeSchemaVersion;
  readonly ok: boolean;
  readonly status: ReadinessStatus;
  readonly workspace: {
    readonly workspaceId: string;
    readonly label: string;
    readonly manifestVersion: number;
  };
  readonly source: {
    readonly sourceCollectionId: string;
    readonly label: string;
    readonly fixtureFileCount: number;
  };
  readonly checks: readonly LocalWorkspaceReadinessCheck[];
  readonly ingestion: {
    readonly eventCount: number;
    readonly evidenceCount: number;
    readonly blobCount: number;
    readonly jobCount: number;
    readonly jobKinds: readonly string[];
    readonly diagnosticCount: number;
  };
  readonly workspaceOps: {
    readonly verifyStatus: ReadinessStatus;
    readonly diskUsageStatus: ReadinessStatus;
    readonly manifestExportStatus: ReadinessStatus;
    readonly backupCheckStatus: ReadinessStatus;
  };
  readonly diagnostics: readonly unknown[];
  readonly proposedActions: readonly unknown[];
}

const orderedCheckIds = [
  "workspace.create",
  "workspace.mount",
  "ingestion.mount-adapter",
  "ingestion.register-source",
  "ingestion.dry-run",
  "ingestion.approve-import",
  "ingestion.import",
  "ingestion.jobs",
  "ingestion.diagnostics",
  "workspace-ops.verify",
  "workspace-ops.disk-usage",
  "workspace-ops.manifest-export",
  "workspace-ops.backup-check"
] as const;

export async function runLocalWorkspaceReadinessSmoke(
  input: RunLocalWorkspaceReadinessSmokeInput = {}
): Promise<LocalWorkspaceReadinessSmokeReport> {
  const createdAt = (input.now ?? (() => new Date().toISOString()))();
  const workspaceRoot = resolve(input.workspaceRoot ?? mkdtempSync(join(tmpdir(), "cestus-smoke-workspace-")));
  const sourceRoot = resolve(input.sourceRoot ?? mkdtempSync(join(tmpdir(), "cestus-smoke-source-")));
  const workspaceId = input.workspaceId ?? "ws_local_workspace_readiness_smoke";
  const workspaceLabel = input.workspaceLabel ?? "Local Workspace Readiness Smoke";
  const sourceCollectionId = input.sourceCollectionId ?? "src_local_workspace_readiness_smoke";
  const sourceLabel = input.sourceLabel ?? "Local Workspace Readiness Smoke Source";
  const scanBatchId = input.scanBatchId ?? "scan_local_workspace_readiness_smoke";
  const importBatchId = input.importBatchId ?? "imp_local_workspace_readiness_smoke";
  const approvedBy = input.approvedBy ?? "actor_local_workspace_readiness_smoke";
  const checks: LocalWorkspaceReadinessCheck[] = [];
  const diagnostics: unknown[] = [];
  const proposedActions: unknown[] = [];
  const workspaceOpsStatus = {
    verifyStatus: "blocked" as ReadinessStatus,
    diskUsageStatus: "blocked" as ReadinessStatus,
    manifestExportStatus: "blocked" as ReadinessStatus,
    backupCheckStatus: "blocked" as ReadinessStatus
  };
  let ledger: SQLiteEventLedger | undefined;
  let eventCount = 0;
  let evidenceCount = 0;
  let blobCount = 0;
  let jobCount = 0;
  let jobKinds: readonly string[] = [];
  let diagnosticCount = 0;
  let fixtureFileCount = 0;

  try {
    fixtureFileCount = ensureFixtureSource(sourceRoot);
    let portableWorkspace: MountedPortableWorkspace;
    try {
      portableWorkspace = createPortableWorkspace({
        rootDir: workspaceRoot,
        workspaceId,
        label: workspaceLabel,
        createdAt,
        createdBy: "local-workspace-readiness-smoke"
      });
    } catch {
      diagnostics.push({
        code: "workspace-create-failed",
        message: "Portable workspace creation failed; choose an empty workspace root.",
        allowedRepairActions: ["choose an empty workspace root", "rerun local workspace readiness smoke"]
      });
      recordCheck(
        checks,
        "workspace.create",
        "blocked",
        "Portable workspace creation failed before mount or ingestion."
      );
      return finalizeReport(reportState());
    }
    recordCheck(checks, "workspace.create", "ready", "Portable workspace manifest and canonical roots were created.");

    mkdirSync(join(workspaceRoot, "diagnostics"), { recursive: true });
    mkdirSync(join(workspaceRoot, "backups"), { recursive: true });

    const mountedResult = mountPortableWorkspace({ rootDir: workspaceRoot });
    if (!mountedResult.ok) {
      diagnostics.push(mountedResult.diagnostic);
      recordCheck(checks, "workspace.mount", "blocked", mountedResult.diagnostic.message);
      return finalizeReport(reportState());
    }

    const mounted = mountedResult.workspace;
    if (mounted.paths.ledgerPath !== portableWorkspace.paths.ledgerPath) {
      recordCheck(checks, "workspace.mount", "blocked", "Mounted workspace ledger path did not match creation output.");
      return finalizeReport(reportState());
    }
    recordCheck(checks, "workspace.mount", "ready", "Portable workspace mounted through the canonical mount contract.");

    ledger = new SQLiteEventLedger(mounted.paths.ledgerPath);
    const ingestionWorkspace = mountedIngestionWorkspace(mounted, ledger);
    recordCheck(checks, "ingestion.mount-adapter", "ready", "Ingestion workspace uses mounted ledger and blob roots.");

    const runtime = createIngestionRuntime({
      mountedWorkspace: ingestionWorkspace,
      actor: { id: approvedBy, kind: "human", label: "Local Workspace Readiness Smoke" }
    });
    const registered = await runtime.registerSource({
      sourceCollectionId,
      label: sourceLabel,
      rootUri: pathToFileURL(sourceRoot).href,
      sourceRoot
    });
    if (!registered.ok) {
      diagnostics.push(registered.error);
      recordCheck(checks, "ingestion.register-source", "blocked", registered.error.message);
      return finalizeReport(reportState());
    }
    recordCheck(checks, "ingestion.register-source", "ready", "Local source collection was registered.");

    const scanned = await runtime.dryRunScan({ sourceCollectionId, scanBatchId });
    if (!scanned.ok) {
      diagnostics.push(scanned.error);
      recordCheck(checks, "ingestion.dry-run", "blocked", scanned.error.message);
      return finalizeReport(reportState());
    }
    recordCheck(checks, "ingestion.dry-run", "ready", "Dry-run scan hashed deterministic local source bytes.");

    const beforeApproval = await ledgerState(ledger, mounted.paths.blobRoot);
    const approved = await runtime.approveRawImport({
      sourceCollectionId,
      scanBatchId,
      importBatchId,
      approvedBy
    });
    const afterApproval = await ledgerState(ledger, mounted.paths.blobRoot);
    if (!approved.ok) {
      diagnostics.push(approved.error);
      recordCheck(checks, "ingestion.approve-import", "blocked", approved.error.message);
      return finalizeReport(reportState());
    }
    const approvalOnly =
      afterApproval.evidenceCount === beforeApproval.evidenceCount &&
      afterApproval.blobCount === beforeApproval.blobCount;
    recordCheck(
      checks,
      "ingestion.approve-import",
      approvalOnly ? "ready" : "blocked",
      approvalOnly
        ? "Raw import approval appended approval only with no evidence or blob writes."
        : "Raw import approval unexpectedly created evidence or blob state."
    );
    if (!approvalOnly) {
      return finalizeReport(reportState(afterApproval.events));
    }

    const imported = await runtime.importApproved({ sourceCollectionId, scanBatchId, importBatchId });
    const afterImport = await ledgerState(ledger, mounted.paths.blobRoot);
    if (!imported.ok) {
      diagnostics.push(imported.error);
      recordCheck(checks, "ingestion.import", "blocked", imported.error.message);
      return finalizeReport(reportState(afterImport.events));
    }
    const importCreatedEvidenceAndBlob =
      afterImport.evidenceCount > afterApproval.evidenceCount &&
      afterImport.blobCount > afterApproval.blobCount;
    recordCheck(
      checks,
      "ingestion.import",
      importCreatedEvidenceAndBlob ? "ready" : "blocked",
      importCreatedEvidenceAndBlob
        ? "Approved import verified current bytes and created evidence/blob state."
        : "Approved import did not create the expected evidence/blob state."
    );
    if (!importCreatedEvidenceAndBlob) {
      return finalizeReport(reportState(afterImport.events));
    }

    const jobs = await runtime.listJobs({ sourceCollectionId });
    if (!jobs.ok) {
      diagnostics.push(jobs.error);
      recordCheck(checks, "ingestion.jobs", "blocked", jobs.error.message);
      return finalizeReport(reportState(afterImport.events));
    }
    jobCount = jobs.jobs.length;
    jobKinds = [...new Set(jobs.jobs.map((job) => job.kind))].sort(compareCodeUnits);
    const requiredJobsPresent = ["import", "local-parse", "scan"].every((kind) => jobKinds.includes(kind));
    recordCheck(
      checks,
      "ingestion.jobs",
      requiredJobsPresent ? "ready" : "blocked",
      requiredJobsPresent
        ? "Ingestion job DTOs include scan, import, and local parse jobs."
        : "Ingestion job DTOs were missing a required local readiness job kind."
    );
    if (!requiredJobsPresent) {
      return finalizeReport(reportState(afterImport.events));
    }

    const ingestionDiagnostics = await runtime.diagnostics({ sourceCollectionId });
    if (!ingestionDiagnostics.ok) {
      diagnostics.push(ingestionDiagnostics.error);
      recordCheck(checks, "ingestion.diagnostics", "blocked", ingestionDiagnostics.error.message);
      return finalizeReport(reportState(afterImport.events));
    }
    diagnosticCount = ingestionDiagnostics.diagnostics.length;
    diagnostics.push(...ingestionDiagnostics.diagnostics);
    recordCheck(
      checks,
      "ingestion.diagnostics",
      diagnosticCount === 0 ? "ready" : "degraded",
      diagnosticCount === 0 ? "No ingestion diagnostics were reported." : "Ingestion reported diagnostics."
    );

    const fileSystem = new NodeWorkspaceFileSystem();
    const layoutResult = await resolveWorkspaceLayout({ rootPath: workspaceRoot }, fileSystem);
    const workspaceOps = await runWorkspaceOps({
      layoutResult,
      ledger,
      fileSystem,
      createdAt
    });

    workspaceOpsStatus.verifyStatus = workspaceOps.verifyStatus;
    workspaceOpsStatus.diskUsageStatus = workspaceOps.diskUsageStatus;
    workspaceOpsStatus.manifestExportStatus = workspaceOps.manifestExportStatus;
    workspaceOpsStatus.backupCheckStatus = workspaceOps.backupCheckStatus;
    diagnostics.push(...workspaceOps.diagnostics);
    proposedActions.push(...workspaceOps.proposedActions);
    recordCheck(checks, "workspace-ops.verify", workspaceOps.verifyStatus, workspaceOps.verifySummary);
    recordCheck(checks, "workspace-ops.disk-usage", workspaceOps.diskUsageStatus, workspaceOps.diskUsageSummary);
    recordCheck(
      checks,
      "workspace-ops.manifest-export",
      workspaceOps.manifestExportStatus,
      workspaceOps.manifestExportSummary
    );
    recordCheck(
      checks,
      "workspace-ops.backup-check",
      workspaceOps.backupCheckStatus,
      workspaceOps.backupCheckSummary
    );

    return finalizeReport(reportState(afterImport.events));
  } finally {
    ledger?.close();
  }

  function reportState(events: readonly KnowledgeEvent[] = []): ReportState {
    eventCount = events.length;
    evidenceCount = countEvents(events, "evidence.ingested");
    blobCount = countFiles(workspaceRoot, "blobs");

    return {
      workspaceId,
      workspaceLabel,
      sourceCollectionId,
      sourceLabel,
      fixtureFileCount,
      checks,
      eventCount,
      evidenceCount,
      blobCount,
      jobCount,
      jobKinds,
      diagnosticCount,
      workspaceOpsStatus,
      diagnostics,
      proposedActions
    };
  }
}

interface ReportState {
  readonly workspaceId: string;
  readonly workspaceLabel: string;
  readonly sourceCollectionId: string;
  readonly sourceLabel: string;
  readonly fixtureFileCount: number;
  readonly checks: readonly LocalWorkspaceReadinessCheck[];
  readonly eventCount: number;
  readonly evidenceCount: number;
  readonly blobCount: number;
  readonly jobCount: number;
  readonly jobKinds: readonly string[];
  readonly diagnosticCount: number;
  readonly workspaceOpsStatus: {
    readonly verifyStatus: ReadinessStatus;
    readonly diskUsageStatus: ReadinessStatus;
    readonly manifestExportStatus: ReadinessStatus;
    readonly backupCheckStatus: ReadinessStatus;
  };
  readonly diagnostics: readonly unknown[];
  readonly proposedActions: readonly unknown[];
}

interface LedgerState {
  readonly events: readonly KnowledgeEvent[];
  readonly evidenceCount: number;
  readonly blobCount: number;
}

interface WorkspaceOpsRun {
  readonly verifyStatus: ReadinessStatus;
  readonly verifySummary: string;
  readonly diskUsageStatus: ReadinessStatus;
  readonly diskUsageSummary: string;
  readonly manifestExportStatus: ReadinessStatus;
  readonly manifestExportSummary: string;
  readonly backupCheckStatus: ReadinessStatus;
  readonly backupCheckSummary: string;
  readonly diagnostics: readonly WorkspaceDiagnosticDto[];
  readonly proposedActions: readonly ProposedRepairActionDto[];
}

async function ledgerState(ledger: SQLiteEventLedger, blobRoot: string): Promise<LedgerState> {
  const events = await ledger.readAll();
  return {
    events,
    evidenceCount: countEvents(events, "evidence.ingested"),
    blobCount: countFiles(blobRoot)
  };
}

function mountedIngestionWorkspace(
  mounted: MountedPortableWorkspace,
  ledger: SQLiteEventLedger
): MountedWorkspace {
  return {
    workspaceId: mounted.workspaceId,
    label: mounted.label,
    ledger,
    blobStore: new FileBlobStore(mounted.paths.blobRoot),
    derivativeStore: new FileBlobStore(mounted.paths.derivativeRoot),
    jobStateRoot: mounted.paths.jobRoot,
    diagnosticsRoot: join(mounted.rootDir, "diagnostics"),
    projectionCacheRoot: mounted.paths.cacheRoot,
    capabilities: mountedWorkspaceCapabilities({
      canReadLedger: true,
      canAppendLedger: true,
      canWriteBlobs: true,
      canWriteDerivatives: true,
      canWriteJobState: true
    })
  };
}

async function runWorkspaceOps(input: {
  readonly layoutResult: WorkspaceLayoutResult;
  readonly ledger: SQLiteEventLedger;
  readonly fileSystem: NodeWorkspaceFileSystem;
  readonly createdAt: string;
}): Promise<WorkspaceOpsRun> {
  const diagnostics: WorkspaceDiagnosticDto[] = [];
  const proposedActions: ProposedRepairActionDto[] = [];
  const verify = await verifyWorkspace({
    layout: input.layoutResult,
    fileSystem: input.fileSystem,
    eventReader: { readAll: async () => input.ledger.readAll() }
  });
  diagnostics.push(...verify.diagnostics);
  proposedActions.push(...verify.proposedActions);

  const layout = input.layoutResult.layout;
  const workspace = input.layoutResult.workspace;
  if (layout === undefined || workspace === undefined || verify.status === "blocked") {
    return {
      verifyStatus: verify.status,
      verifySummary: "Workspace ops verification did not resolve a ready workspace.",
      diskUsageStatus: "blocked",
      diskUsageSummary: "Disk usage was skipped because workspace verification was blocked.",
      manifestExportStatus: "blocked",
      manifestExportSummary: "Manifest export was skipped because workspace verification was blocked.",
      backupCheckStatus: "blocked",
      backupCheckSummary: "Backup check was skipped because workspace verification was blocked.",
      diagnostics,
      proposedActions
    };
  }

  const diskUsage = await reportDiskUsage({ layout, fileSystem: input.fileSystem });
  diagnostics.push(...diskUsage.diagnostics);
  proposedActions.push(...diskUsage.proposedActions);
  const categoryBytes = diskUsage.payload?.categories ?? [];
  const events = await input.ledger.readAll();
  const manifestExport = await exportWorkspaceManifest({
    workspace,
    layout,
    ledgerEventCount: events.length,
    ledgerHighWaterMark: events.length,
    categoryBytes,
    diagnosticCounts: diagnosticCounts(verify.diagnostics),
    ...(verify.payload === undefined ? {} : { jobCounts: verify.payload.jobs }),
    createdAt: input.createdAt
  });
  diagnostics.push(...manifestExport.diagnostics);
  proposedActions.push(...manifestExport.proposedActions);

  const backupCheck = await checkBackupManifest({
    workspace,
    currentLedgerHighWaterMark: events.length,
    backupManifest: manifestExport.payload
  });
  diagnostics.push(...backupCheck.diagnostics);
  proposedActions.push(...backupCheck.proposedActions);

  return {
    verifyStatus: verify.status,
    verifySummary: verify.status === "ready" ? "Workspace ops verification reported ready." : "Workspace ops verification degraded.",
    diskUsageStatus: diskUsage.status,
    diskUsageSummary: diskUsage.status === "ready" ? "Workspace disk usage reported ready." : "Workspace disk usage degraded.",
    manifestExportStatus: manifestExport.status,
    manifestExportSummary: manifestExport.status === "ready"
      ? "Secret-free workspace manifest export reported ready."
      : "Workspace manifest export degraded.",
    backupCheckStatus: backupCheck.status,
    backupCheckSummary: backupCheck.status === "ready"
      ? "Freshly exported workspace manifest passed backup coverage checks."
      : "Backup coverage check degraded.",
    diagnostics,
    proposedActions
  };
}

function diagnosticCounts(diagnostics: readonly WorkspaceDiagnosticDto[]): {
  readonly errorCount: number;
  readonly warningCount: number;
} {
  return {
    errorCount: diagnostics.filter((diagnostic) => diagnostic.severity === "error").length,
    warningCount: diagnostics.filter((diagnostic) => diagnostic.severity === "warning").length
  };
}

function finalizeReport(state: ReportState): LocalWorkspaceReadinessSmokeReport {
  const checks = orderedChecks(state.checks);
  const allChecksReady = checks.every((check) => check.status === "ready");
  const noDiagnostics = state.diagnostics.length === 0;
  const status = allChecksReady && noDiagnostics
    ? "ready"
    : checks.some((check) => check.status === "blocked")
      ? "blocked"
      : "degraded";

  return {
    schemaVersion: localWorkspaceReadinessSmokeSchemaVersion,
    ok: status === "ready",
    status,
    workspace: {
      workspaceId: state.workspaceId,
      label: state.workspaceLabel,
      manifestVersion: 1
    },
    source: {
      sourceCollectionId: state.sourceCollectionId,
      label: state.sourceLabel,
      fixtureFileCount: state.fixtureFileCount
    },
    checks,
    ingestion: {
      eventCount: state.eventCount,
      evidenceCount: state.evidenceCount,
      blobCount: state.blobCount,
      jobCount: state.jobCount,
      jobKinds: [...state.jobKinds],
      diagnosticCount: state.diagnosticCount
    },
    workspaceOps: state.workspaceOpsStatus,
    diagnostics: [...state.diagnostics],
    proposedActions: [...state.proposedActions]
  };
}

function orderedChecks(
  checks: readonly LocalWorkspaceReadinessCheck[]
): readonly LocalWorkspaceReadinessCheck[] {
  const byId = new Map(checks.map((check) => [check.checkId, check]));
  return orderedCheckIds.map((checkId) =>
    byId.get(checkId) ?? {
      checkId,
      ok: false,
      status: "blocked",
      summary: "Check was not reached."
    }
  );
}

function recordCheck(
  checks: LocalWorkspaceReadinessCheck[],
  checkId: (typeof orderedCheckIds)[number],
  status: ReadinessStatus,
  summary: string
): void {
  checks.push({
    checkId,
    ok: status === "ready",
    status,
    summary
  });
}

function ensureFixtureSource(sourceRoot: string): number {
  mkdirSync(sourceRoot, { recursive: true });
  if (readdirSync(sourceRoot).length === 0) {
    writeFileSync(
      join(sourceRoot, "workspace-readiness-fixture.txt"),
      "Cestus local workspace readiness smoke fixture.\n",
      "utf8"
    );
  }
  return countFiles(sourceRoot);
}

function countEvents(events: readonly KnowledgeEvent[], type: KnowledgeEvent["type"]): number {
  return events.filter((event) => event.type === type).length;
}

function countFiles(...pathParts: string[]): number {
  const root = resolve(...pathParts);
  if (!existsSync(root)) {
    return 0;
  }

  let count = 0;
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    const stat = lstatSync(path);
    if (stat.isDirectory()) {
      count += countFiles(path);
    } else if (stat.isFile()) {
      count += 1;
    }
  }
  return count;
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
