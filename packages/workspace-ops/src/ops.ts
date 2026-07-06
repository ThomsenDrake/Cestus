import { pathToFileURL } from "node:url";
import { validateKnowledgeEvent } from "../../ontology/src/contracts.js";
import {
  createWorkspaceOpsEnvelope,
  isSecretSafeWorkspaceText,
  mountStatusSchema,
  workspaceOpsSchemaVersion,
  type DiskUsageDto,
  type MountStatusDto,
  type ProposedRepairActionInput,
  type WorkspaceDiagnosticInput,
  type WorkspaceOpsEnvelope,
  type WorkspaceVerifyDto
} from "./contracts.js";
import { childPath, type WorkspaceFileSystem } from "./filesystem.js";
import {
  parseWorkspaceManifestIdentity,
  type ResolvedWorkspaceLayout,
  type WorkspaceLayoutResult
} from "./layout.js";

export interface WorkspaceEventReader {
  readAll(layout: ResolvedWorkspaceLayout): Promise<readonly unknown[]>;
}

export interface VerifyWorkspaceInput {
  readonly layout: WorkspaceLayoutResult;
  readonly fileSystem: WorkspaceFileSystem;
  readonly eventReader: WorkspaceEventReader;
}

export interface ReportDiskUsageInput {
  readonly layout: ResolvedWorkspaceLayout;
  readonly fileSystem: WorkspaceFileSystem;
  readonly warningThresholdBytes?: number;
}

const workspaceRootSpecs = [
  { rootId: "manifest", category: "manifest", path: (layout: ResolvedWorkspaceLayout) => layout.manifestPath },
  { rootId: "ledger", category: "ledger", path: (layout: ResolvedWorkspaceLayout) => layout.ledgerPath },
  { rootId: "blobs", category: "blobs", path: (layout: ResolvedWorkspaceLayout) => layout.blobRoot },
  { rootId: "derivatives", category: "derivatives", path: (layout: ResolvedWorkspaceLayout) => layout.derivativeRoot },
  { rootId: "jobs", category: "jobs", path: (layout: ResolvedWorkspaceLayout) => layout.jobRoot },
  { rootId: "projections", category: "projections", path: (layout: ResolvedWorkspaceLayout) => layout.projectionRoot },
  { rootId: "diagnostics", category: "diagnostics", path: (layout: ResolvedWorkspaceLayout) => layout.diagnosticsRoot },
  { rootId: "backups", category: "backups", path: (layout: ResolvedWorkspaceLayout) => layout.backupRoot }
] as const;

type WorkspaceRootSpec = (typeof workspaceRootSpecs)[number];
type WorkspaceRootCategory = WorkspaceRootSpec["category"];
type WorkspaceRootId = WorkspaceRootSpec["rootId"];
type WorkspaceRootStatus = "available" | "missing" | "unreadable";
type ManifestValidationReason =
  | "valid"
  | "unavailable"
  | "unreadable"
  | "invalid-shape"
  | "identity-mismatch"
  | "version-mismatch";

interface InspectedRoot {
  readonly rootId: WorkspaceRootId;
  readonly category: WorkspaceRootCategory;
  readonly path: string;
  readonly status: WorkspaceRootStatus;
  readonly safeUri: string;
}

interface ManifestValidation {
  readonly readable: boolean;
  readonly valid: boolean;
  readonly reason: ManifestValidationReason;
}

export async function verifyWorkspace(
  input: VerifyWorkspaceInput
): Promise<WorkspaceOpsEnvelope<WorkspaceVerifyDto>> {
  if (input.layout.layout === undefined || input.layout.workspace === undefined) {
    const diagnostics = [...input.layout.diagnostics];
    return createWorkspaceOpsEnvelope({
      command: "verify workspace",
      status: "blocked",
      payload: blockedVerifyPayload(input.layout),
      diagnostics,
      proposedActions: remountActions(input.layout.proposedActions)
    });
  }

  const layout = input.layout.layout;
  const manifestRoot = await inspectWorkspaceRoot(input.fileSystem, workspaceRootSpecs[0], layout);
  const manifestValidation = manifestRoot.status === "available"
    ? await validateResolvedManifest(input.fileSystem, layout, input.layout.workspace)
    : { readable: false, valid: false, reason: "unavailable" as const };

  const diagnostics: WorkspaceDiagnosticInput[] = [];
  const proposedActions: ProposedRepairActionInput[] = [];

  if (manifestRoot.status !== "available" || !manifestValidation.valid) {
    diagnostics.push({
      diagnosticId: "diag_workspace_manifest_unavailable",
      severity: "error",
      category: "manifest",
      message: "Workspace manifest is unavailable; rerun workspace detection before trusting this layout.",
      durable: false,
      repairHint: {
        allowedNextCommands: ["detect drive", "verify workspace"],
        requiresHumanApproval: false
      }
    });
    proposedActions.push(manifestRevalidationAction(manifestValidation.reason));

    return createWorkspaceOpsEnvelope({
      command: "verify workspace",
      status: "blocked",
      workspace: input.layout.workspace,
      payload: manifestBlockedVerifyPayload(input.layout, layout, manifestRoot, manifestValidation, diagnostics),
      diagnostics,
      proposedActions
    });
  }

  const roots = [
    manifestRoot,
    ...(await inspectWorkspaceRoots(input.fileSystem, layout, workspaceRootSpecs.slice(1)))
  ];
  const rootMap = new Map<WorkspaceRootId, InspectedRoot>(
    roots.map((root) => [root.rootId, root])
  );
  const ledgerRoot = requireRoot(rootMap, "ledger");
  const blobRoot = requireRoot(rootMap, "blobs");
  const projectionRoot = requireRoot(rootMap, "projections");
  const derivativeRoot = requireRoot(rootMap, "derivatives");
  const jobRoot = requireRoot(rootMap, "jobs");
  const diagnosticsRoot = requireRoot(rootMap, "diagnostics");
  const backupRoot = requireRoot(rootMap, "backups");

  let events: readonly unknown[] = [];
  let ledgerReadable = false;

  if (ledgerRoot.status !== "available") {
    diagnostics.push(canonicalDiagnostic(
      "diag_workspace_ledger_root_unavailable",
      "ledger",
      "Workspace ledger root is not available."
    ));
    proposedActions.push(canonicalRepairAction("repair_workspace_ledger_root_unavailable"));
  } else if (manifestValidation.valid) {
    try {
      events = await input.eventReader.readAll(layout);
      ledgerReadable = true;
    } catch {
      diagnostics.push(canonicalDiagnostic(
        "diag_workspace_ledger_read_failed",
        "ledger",
        "Workspace ledger could not be read safely."
      ));
      proposedActions.push(canonicalRepairAction("repair_workspace_ledger_read_failed"));
    }
  }

  const invalidEventCount = ledgerReadable
    ? events.filter((event) => !validateKnowledgeEvent(event).success).length
    : 0;
  if (invalidEventCount > 0) {
    diagnostics.push(canonicalDiagnostic(
      "diag_workspace_ledger_event_validation_failed",
      "ledger",
      "Workspace ledger contains events that failed contract validation."
    ));
    proposedActions.push(canonicalRepairAction("repair_workspace_ledger_event_validation_failed"));
  }

  const blobTotal = blobRoot.status === "available"
    ? await bytesForPath(input.fileSystem, blobRoot.path)
    : { bytes: 0, readable: false };
  const blobAvailable = blobRoot.status === "available" && blobTotal.readable;
  if (!blobAvailable) {
    diagnostics.push(canonicalDiagnostic(
      blobRoot.status === "available"
        ? "diag_workspace_blob_root_unreadable"
        : "diag_workspace_blob_root_unavailable",
      "blob-integrity",
      blobRoot.status === "available"
        ? "Workspace blob store root could not be traversed safely."
        : "Workspace blob store root is not available."
    ));
    proposedActions.push(canonicalRepairAction(
      blobRoot.status === "available"
        ? "repair_workspace_blob_root_unreadable"
        : "repair_workspace_blob_root_unavailable"
    ));
  }

  const contentAddressedRootCount = blobAvailable
    ? await safeChildCount(input.fileSystem, blobRoot.path)
    : 0;

  if (projectionRoot.status !== "available") {
    diagnostics.push({
      diagnosticId: "diag_workspace_projection_root_missing",
      severity: "warning",
      category: "projection",
      message: "Projection root is missing and can be regenerated from ledger events.",
      durable: false,
      repairHint: {
        allowedNextCommands: ["projection rebuild-readiness", "projection rebuild"],
        requiresHumanApproval: false
      }
    });
    proposedActions.push({
      actionId: "action_rebuild_workspace_projections",
      kind: "rebuild-projection",
      title: "Rebuild expendable projection artifacts from ledger events.",
      severity: "warning",
      requiresHumanApproval: false,
      mutatesCanonicalState: false,
      allowedNextCommands: ["projection rebuild-readiness", "projection rebuild"]
    });
  }

  for (const root of [derivativeRoot, jobRoot, diagnosticsRoot, backupRoot]) {
    if (root.status !== "available") {
      diagnostics.push({
        diagnosticId: `diag_workspace_${root.rootId}_root_unavailable`,
        severity: "warning",
        category: supportRootDiagnosticCategory(root),
        message: "Workspace derived or support root is not available.",
        durable: false,
        repairHint: {
          allowedNextCommands: ["verify workspace", "diagnostics inspect"],
          requiresHumanApproval: false
        }
      });
    }
  }

  const payload: WorkspaceVerifyDto = {
    schemaVersion: workspaceOpsSchemaVersion,
    mountStatus: mountStatusForManifestValidation(input.layout.mountStatus, manifestValidation.reason),
    manifest: {
      readable: manifestValidation.readable,
      valid: manifestValidation.valid,
      ...(input.layout.workspace.manifestVersion === undefined
        ? {}
        : { manifestVersion: input.layout.workspace.manifestVersion }),
      safeSummary: manifestSafeSummary(manifestValidation.reason)
    },
    layout: {
      contractVersion: layout.layoutContractVersion,
      readable: roots.every((root) => root.status !== "unreadable"),
      requiredRoots: roots.map((root) => ({
        rootId: root.rootId,
        category: root.category,
        status: root.status,
        safeUri: root.safeUri
      }))
    },
    ledger: {
      readable: ledgerReadable,
      eventCount: events.length,
      highWaterMark: highWaterMark(events)
    },
    blobStore: {
      available: blobAvailable,
      contentAddressedRootCount,
      aggregateBytes: blobTotal.bytes,
      missingBlobCount: blobAvailable ? 0 : 1,
      hashMismatchCount: 0
    },
    projections: {
      available: projectionRoot.status === "available",
      staleCount: 0,
      rebuildable: ledgerReadable
    },
    jobs: {
      available: jobRoot.status === "available",
      queuedCount: 0,
      failedCount: 0
    },
    diagnostics: {
      visible: diagnosticsRoot.status === "available",
      errorCount: diagnostics.filter((diagnostic) => diagnostic.severity === "error").length,
      warningCount: diagnostics.filter((diagnostic) => diagnostic.severity === "warning").length
    },
    backup: {
      manifestAvailable: backupRoot.status === "available",
      stale: backupRoot.status !== "available"
    }
  };

  return createWorkspaceOpsEnvelope({
    command: "verify workspace",
    status: verificationStatus(ledgerReadable, diagnostics),
    workspace: input.layout.workspace,
    payload,
    diagnostics,
    proposedActions
  });
}

export async function reportDiskUsage(
  input: ReportDiskUsageInput
): Promise<WorkspaceOpsEnvelope<DiskUsageDto>> {
  const roots = [];
  const diagnostics: WorkspaceDiagnosticInput[] = [];
  const availableBytes = await safeAvailableBytes(input.fileSystem, input.layout.rootPath);

  if (!availableBytes.readable) {
    diagnostics.push({
      diagnosticId: "diag_workspace_disk_available_bytes_unreadable",
      severity: "warning",
      category: "disk",
      message: "Workspace free-space estimate could not be inspected safely.",
      durable: false,
      repairHint: {
        allowedNextCommands: ["disk usage", "diagnostics inspect"],
        requiresHumanApproval: false
      }
    });
  }

  for (const spec of workspaceRootSpecs) {
    const path = spec.path(input.layout);
    const exists = await safeExists(input.fileSystem, path);
    const total = exists === true ? await bytesForPath(input.fileSystem, path) : { bytes: 0, readable: true };
    if (!total.readable || exists === "unreadable") {
      diagnostics.push({
        diagnosticId: `diag_workspace_disk_${spec.rootId}_unreadable`,
        severity: "warning",
        category: "disk",
        message: "Workspace storage category could not be inspected safely.",
        durable: false,
        repairHint: {
          allowedNextCommands: ["disk usage", "diagnostics inspect"],
          requiresHumanApproval: false
        }
      });
    }

    roots.push({
      rootId: spec.rootId,
      category: spec.category,
      bytes: total.bytes,
      exists: exists === true,
      safeUri: safeUriForPath(path)
    });
  }

  const categories = aggregateCategories(roots);
  const totalBytes = categories.reduce((total, category) => total + category.bytes, 0);
  const estimatedFreeBytes = availableBytes.bytes;
  const thresholdWarnings =
    estimatedFreeBytes !== undefined &&
    input.warningThresholdBytes !== undefined &&
    estimatedFreeBytes < input.warningThresholdBytes
      ? ["Estimated free space is below the configured warning threshold."]
      : [];

  return createWorkspaceOpsEnvelope({
    command: "disk usage",
    status: diagnostics.length === 0 ? "ready" : "degraded",
    payload: {
      schemaVersion: workspaceOpsSchemaVersion,
      ...(estimatedFreeBytes === undefined ? {} : { estimatedFreeBytes }),
      thresholdWarnings,
      roots,
      categories,
      totalBytes
    },
    diagnostics
  });
}

function blockedVerifyPayload(layout: WorkspaceLayoutResult): WorkspaceVerifyDto {
  const errorCount = layout.diagnostics.filter((diagnostic) => diagnostic.severity === "error").length;
  const warningCount = layout.diagnostics.filter((diagnostic) => diagnostic.severity === "warning").length;
  return {
    schemaVersion: workspaceOpsSchemaVersion,
    mountStatus: layout.mountStatus,
    manifest: {
      readable: false,
      valid: false,
      safeSummary: "Workspace manifest cannot be verified until the workspace drive is available."
    },
    layout: {
      contractVersion: "unavailable",
      readable: false,
      requiredRoots: []
    },
    ledger: { readable: false, eventCount: 0, highWaterMark: 0 },
    blobStore: {
      available: false,
      contentAddressedRootCount: 0,
      aggregateBytes: 0,
      missingBlobCount: 0,
      hashMismatchCount: 0
    },
    projections: { available: false, staleCount: 0, rebuildable: false },
    jobs: { available: false, queuedCount: 0, failedCount: 0 },
    diagnostics: { visible: false, errorCount, warningCount },
    backup: { manifestAvailable: false, stale: true }
  };
}

function manifestBlockedVerifyPayload(
  layoutResult: WorkspaceLayoutResult,
  layout: ResolvedWorkspaceLayout,
  manifestRoot: InspectedRoot,
  manifestValidation: ManifestValidation,
  diagnostics: readonly WorkspaceDiagnosticInput[]
): WorkspaceVerifyDto {
  return {
    schemaVersion: workspaceOpsSchemaVersion,
    mountStatus: mountStatusForManifestValidation(layoutResult.mountStatus, manifestValidation.reason),
    manifest: {
      readable: manifestValidation.readable,
      valid: manifestValidation.valid,
      ...(layoutResult.workspace?.manifestVersion === undefined
        ? {}
        : { manifestVersion: layoutResult.workspace.manifestVersion }),
      safeSummary: manifestSafeSummary(manifestValidation.reason)
    },
    layout: {
      contractVersion: layout.layoutContractVersion,
      readable: false,
      requiredRoots: [
        {
          rootId: manifestRoot.rootId,
          category: manifestRoot.category,
          status: manifestRoot.status,
          safeUri: manifestRoot.safeUri
        }
      ]
    },
    ledger: { readable: false, eventCount: 0, highWaterMark: 0 },
    blobStore: {
      available: false,
      contentAddressedRootCount: 0,
      aggregateBytes: 0,
      missingBlobCount: 0,
      hashMismatchCount: 0
    },
    projections: { available: false, staleCount: 0, rebuildable: false },
    jobs: { available: false, queuedCount: 0, failedCount: 0 },
    diagnostics: {
      visible: false,
      errorCount: diagnostics.filter((diagnostic) => diagnostic.severity === "error").length,
      warningCount: diagnostics.filter((diagnostic) => diagnostic.severity === "warning").length
    },
    backup: { manifestAvailable: false, stale: true }
  };
}

async function inspectWorkspaceRoots(
  fileSystem: WorkspaceFileSystem,
  layout: ResolvedWorkspaceLayout,
  specs: readonly WorkspaceRootSpec[] = workspaceRootSpecs
): Promise<InspectedRoot[]> {
  const roots: InspectedRoot[] = [];
  for (const spec of specs) {
    roots.push(await inspectWorkspaceRoot(fileSystem, spec, layout));
  }
  return roots;
}

async function inspectWorkspaceRoot(
  fileSystem: WorkspaceFileSystem,
  spec: WorkspaceRootSpec,
  layout: ResolvedWorkspaceLayout
): Promise<InspectedRoot> {
  const path = spec.path(layout);
  return {
    rootId: spec.rootId,
    category: spec.category,
    path,
    status: await pathStatus(fileSystem, path),
    safeUri: safeUriForPath(path)
  };
}

async function validateResolvedManifest(
  fileSystem: WorkspaceFileSystem,
  layout: ResolvedWorkspaceLayout,
  workspace: NonNullable<WorkspaceLayoutResult["workspace"]>
): Promise<ManifestValidation> {
  let rawManifest: string;
  try {
    rawManifest = await fileSystem.readText(layout.manifestPath);
  } catch {
    return { readable: false, valid: false, reason: "unreadable" };
  }

  let manifestValue: unknown;
  try {
    manifestValue = JSON.parse(rawManifest);
  } catch {
    return { readable: true, valid: false, reason: "invalid-shape" };
  }

  const parsed = parseWorkspaceManifestIdentity(manifestValue);
  if (parsed !== undefined) {
    if (parsed.workspaceId !== workspace.workspaceId) {
      return { readable: true, valid: false, reason: "identity-mismatch" };
    }
    if (parsed.version !== workspace.manifestVersion) {
      return { readable: true, valid: false, reason: "version-mismatch" };
    }
    return { readable: true, valid: true, reason: "valid" };
  }

  const mismatchReason = manifestIdentityMismatchReason(manifestValue, workspace);
  return { readable: true, valid: false, reason: mismatchReason ?? "invalid-shape" };
}

function manifestIdentityMismatchReason(
  value: unknown,
  workspace: NonNullable<WorkspaceLayoutResult["workspace"]>
): Extract<ManifestValidationReason, "identity-mismatch" | "version-mismatch"> | undefined {
  if (!isStrictManifestIdentityRecord(value)) {
    return undefined;
  }

  if (value.workspaceId !== workspace.workspaceId) {
    return "identity-mismatch";
  }
  if (value.version !== workspace.manifestVersion) {
    return "version-mismatch";
  }
  return undefined;
}

function isStrictManifestIdentityRecord(value: unknown): value is {
  readonly workspaceId: string;
  readonly label: string;
  readonly version: number;
} {
  if (typeof value !== "object" || value === null || Object.getPrototypeOf(value) !== Object.prototype) {
    return false;
  }

  const keys = Object.keys(value).sort();
  if (keys.join("\0") !== "label\0version\0workspaceId") {
    return false;
  }

  const candidate = value as {
    readonly workspaceId?: unknown;
    readonly label?: unknown;
    readonly version?: unknown;
  };
  return (
    typeof candidate.workspaceId === "string" &&
    /^ws_[a-zA-Z0-9_-]+$/.test(candidate.workspaceId) &&
    typeof candidate.label === "string" &&
    candidate.label.length > 0 &&
    isSecretSafeWorkspaceText(candidate.label) &&
    typeof candidate.version === "number" &&
    Number.isInteger(candidate.version) &&
    candidate.version > 0
  );
}

function mountStatusForManifestValidation(
  mountStatus: MountStatusDto,
  reason: ManifestValidationReason
): MountStatusDto {
  if (!isWrongDriveManifestReason(reason)) {
    return mountStatus;
  }

  return mountStatusSchema.parse({
    status: "wrong-drive",
    safeMessage: "Workspace manifest does not match the resolved workspace.",
    ...(mountStatus.expectedRootUri === undefined ? {} : { expectedRootUri: mountStatus.expectedRootUri }),
    nextCommandHints: [
      {
        allowedNextCommands: ["detect drive"],
        safeReason: "Select the correct workspace root, then rerun drive detection.",
        requiresHumanApproval: false
      }
    ]
  });
}

function manifestRevalidationAction(reason: ManifestValidationReason): ProposedRepairActionInput {
  if (isWrongDriveManifestReason(reason)) {
    return {
      actionId: "action_select_workspace_root",
      kind: "select-workspace",
      title: "Select the correct workspace root and rerun detection.",
      severity: "error",
      requiresHumanApproval: false,
      mutatesCanonicalState: false,
      allowedNextCommands: ["detect drive"]
    };
  }

  return {
    actionId: "action_rerun_workspace_manifest_detection",
    kind: "rerun-verify",
    title: "Rerun workspace detection before trusting this resolved layout.",
    severity: "error",
    requiresHumanApproval: false,
    mutatesCanonicalState: false,
    allowedNextCommands: ["detect drive", "verify workspace"]
  };
}

function manifestSafeSummary(reason: ManifestValidationReason): string {
  if (reason === "valid") {
    return "Workspace manifest is valid.";
  }
  if (isWrongDriveManifestReason(reason)) {
    return "Workspace manifest does not match the resolved workspace.";
  }
  if (reason === "invalid-shape") {
    return "Workspace manifest is invalid.";
  }
  return "Workspace manifest is not readable.";
}

function isWrongDriveManifestReason(reason: ManifestValidationReason): boolean {
  return reason === "identity-mismatch" || reason === "version-mismatch";
}

async function pathStatus(
  fileSystem: WorkspaceFileSystem,
  path: string
): Promise<WorkspaceRootStatus> {
  const exists = await safeExists(fileSystem, path);
  if (exists !== true) {
    return exists === "unreadable" ? "unreadable" : "missing";
  }

  try {
    await fileSystem.stat(path);
    return "available";
  } catch {
    return "unreadable";
  }
}

async function safeExists(
  fileSystem: WorkspaceFileSystem,
  path: string
): Promise<boolean | "unreadable"> {
  try {
    return await fileSystem.exists(path);
  } catch {
    return "unreadable";
  }
}

async function safeAvailableBytes(
  fileSystem: WorkspaceFileSystem,
  path: string
): Promise<{ readonly bytes?: number; readonly readable: boolean }> {
  try {
    const bytes = await fileSystem.availableBytes(path);
    return bytes === undefined ? { readable: true } : { bytes, readable: true };
  } catch {
    return { readable: false };
  }
}

async function bytesForPath(
  fileSystem: WorkspaceFileSystem,
  path: string,
  visitingRealpaths = new Set<string>()
): Promise<{ readonly bytes: number; readonly readable: boolean }> {
  try {
    const realPath = await fileSystem.realpath(path);
    if (visitingRealpaths.has(realPath)) {
      return { bytes: 0, readable: true };
    }
    visitingRealpaths.add(realPath);

    const stats = await fileSystem.stat(path);
    if (stats.kind !== "directory") {
      visitingRealpaths.delete(realPath);
      return { bytes: stats.sizeBytes, readable: true };
    }

    let bytes = 0;
    for (const child of await fileSystem.list(path)) {
      const childTotal = await bytesForPath(fileSystem, childPath(path, child), visitingRealpaths);
      if (!childTotal.readable) {
        visitingRealpaths.delete(realPath);
        return { bytes, readable: false };
      }
      bytes += childTotal.bytes;
    }
    visitingRealpaths.delete(realPath);
    return { bytes, readable: true };
  } catch {
    return { bytes: 0, readable: false };
  }
}

async function safeChildCount(fileSystem: WorkspaceFileSystem, path: string): Promise<number> {
  try {
    return (await fileSystem.list(path)).length;
  } catch {
    return 0;
  }
}

function requireRoot(
  rootMap: ReadonlyMap<WorkspaceRootId, InspectedRoot>,
  rootId: WorkspaceRootId
): InspectedRoot {
  const root = rootMap.get(rootId);
  if (root === undefined) {
    throw new Error(`missing inspected workspace root ${rootId}`);
  }
  return root;
}

function highWaterMark(events: readonly unknown[]): number {
  return events.length;
}

function supportRootDiagnosticCategory(root: InspectedRoot): WorkspaceDiagnosticInput["category"] {
  if (root.category === "backups") {
    return "backup";
  }
  if (root.category === "diagnostics") {
    return "diagnostics";
  }
  return "layout";
}

function verificationStatus(
  ledgerReadable: boolean,
  diagnostics: readonly WorkspaceDiagnosticInput[]
): "ready" | "degraded" | "blocked" {
  if (!ledgerReadable) {
    return "blocked";
  }
  return diagnostics.length === 0 ? "ready" : "degraded";
}

function remountActions(
  existingActions: readonly ProposedRepairActionInput[]
): ProposedRepairActionInput[] {
  const actions = [...existingActions];
  if (!actions.some((action) => action.kind === "remount-drive")) {
    actions.unshift({
      actionId: "action_remount_workspace_drive",
      kind: "remount-drive",
      title: "Remount the workspace drive and rerun verification.",
      severity: "error",
      requiresHumanApproval: false,
      mutatesCanonicalState: false,
      allowedNextCommands: ["detect drive", "verify workspace"]
    });
  }
  return actions;
}

function canonicalDiagnostic(
  diagnosticId: WorkspaceDiagnosticInput["diagnosticId"],
  category: "ledger" | "blob-integrity",
  message: string
): WorkspaceDiagnosticInput {
  return {
    diagnosticId,
    severity: "error",
    category,
    message,
    durable: false,
    repairHint: {
      allowedNextCommands: ["diagnostics inspect"],
      requiresHumanApproval: true
    }
  };
}

function canonicalRepairAction(
  actionId: ProposedRepairActionInput["actionId"]
): ProposedRepairActionInput {
  return {
    actionId,
    kind: "append-repair-event-required",
    title: "Canonical repair requires human approval and a future append-only repair event.",
    severity: "error",
    requiresHumanApproval: true,
    mutatesCanonicalState: true,
    allowedNextCommands: ["diagnostics inspect"]
  };
}

function aggregateCategories(
  roots: readonly DiskUsageDto["roots"][number][]
): DiskUsageDto["categories"] {
  return workspaceRootSpecs.map((spec) => {
    const matchingRoots = roots.filter((root) => root.category === spec.category);
    return {
      category: spec.category,
      bytes: matchingRoots.reduce((total, root) => total + root.bytes, 0),
      exists: matchingRoots.some((root) => root.exists)
    };
  });
}

function safeUriForPath(path: string): string {
  const uri = pathToFileURL(path).href;
  return isSecretSafeWorkspaceText(uri) ? uri : "workspace://redacted-root";
}
