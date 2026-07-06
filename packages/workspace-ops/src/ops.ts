import { pathToFileURL } from "node:url";
import { validateKnowledgeEvent } from "../../ontology/src/contracts.js";
import {
  createWorkspaceOpsEnvelope,
  isSecretSafeWorkspaceText,
  workspaceOpsSchemaVersion,
  type DiskUsageDto,
  type ProposedRepairActionInput,
  type WorkspaceDiagnosticInput,
  type WorkspaceOpsEnvelope,
  type WorkspaceVerifyDto
} from "./contracts.js";
import { childPath, type WorkspaceFileSystem } from "./filesystem.js";
import type { ResolvedWorkspaceLayout, WorkspaceLayoutResult } from "./layout.js";

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

interface InspectedRoot {
  readonly rootId: WorkspaceRootId;
  readonly category: WorkspaceRootCategory;
  readonly path: string;
  readonly status: WorkspaceRootStatus;
  readonly safeUri: string;
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
  const roots = await inspectWorkspaceRoots(input.fileSystem, layout);
  const rootMap = new Map<WorkspaceRootId, InspectedRoot>(
    roots.map((root) => [root.rootId, root])
  );
  const manifestRoot = requireRoot(rootMap, "manifest");
  const ledgerRoot = requireRoot(rootMap, "ledger");
  const blobRoot = requireRoot(rootMap, "blobs");
  const projectionRoot = requireRoot(rootMap, "projections");
  const derivativeRoot = requireRoot(rootMap, "derivatives");
  const jobRoot = requireRoot(rootMap, "jobs");
  const diagnosticsRoot = requireRoot(rootMap, "diagnostics");
  const backupRoot = requireRoot(rootMap, "backups");
  const manifestValidation = manifestRoot.status === "available"
    ? await validateResolvedManifest(input.fileSystem, layout, input.layout.workspace)
    : { readable: false, valid: false };

  const diagnostics: WorkspaceDiagnosticInput[] = [];
  const proposedActions: ProposedRepairActionInput[] = [];

  let events: readonly unknown[] = [];
  let ledgerReadable = false;

  if (ledgerRoot.status !== "available") {
    diagnostics.push(canonicalDiagnostic(
      "diag_workspace_ledger_root_unavailable",
      "ledger",
      "Workspace ledger root is not available."
    ));
    proposedActions.push(canonicalRepairAction("repair_workspace_ledger_root_unavailable"));
  } else {
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
    proposedActions.push({
      actionId: "action_rerun_workspace_manifest_detection",
      kind: "rerun-verify",
      title: "Rerun workspace detection before trusting this resolved layout.",
      severity: "error",
      requiresHumanApproval: false,
      mutatesCanonicalState: false,
      allowedNextCommands: ["detect drive", "verify workspace"]
    });
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
    mountStatus: input.layout.mountStatus,
    manifest: {
      readable: manifestValidation.readable,
      valid: manifestValidation.valid,
      ...(input.layout.workspace.manifestVersion === undefined
        ? {}
        : { manifestVersion: input.layout.workspace.manifestVersion }),
      safeSummary: manifestValidation.valid
        ? "Workspace manifest is valid."
        : "Workspace manifest is not readable."
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
  const estimatedFreeBytes = await input.fileSystem.availableBytes(input.layout.rootPath);
  const roots = [];
  const diagnostics: WorkspaceDiagnosticInput[] = [];

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

async function inspectWorkspaceRoots(
  fileSystem: WorkspaceFileSystem,
  layout: ResolvedWorkspaceLayout
): Promise<InspectedRoot[]> {
  const roots: InspectedRoot[] = [];
  for (const spec of workspaceRootSpecs) {
    const path = spec.path(layout);
    roots.push({
      rootId: spec.rootId,
      category: spec.category,
      path,
      status: await pathStatus(fileSystem, path),
      safeUri: safeUriForPath(path)
    });
  }
  return roots;
}

async function validateResolvedManifest(
  fileSystem: WorkspaceFileSystem,
  layout: ResolvedWorkspaceLayout,
  workspace: NonNullable<WorkspaceLayoutResult["workspace"]>
): Promise<{ readonly readable: boolean; readonly valid: boolean }> {
  try {
    const rawManifest = await fileSystem.readText(layout.manifestPath);
    const parsed = JSON.parse(rawManifest) as unknown;
    if (!isProvisionalWorkspaceManifest(parsed)) {
      return { readable: true, valid: false };
    }
    return {
      readable: true,
      valid:
        parsed.workspaceId === workspace.workspaceId &&
        parsed.version === workspace.manifestVersion
    };
  } catch {
    return { readable: false, valid: false };
  }
}

function isProvisionalWorkspaceManifest(value: unknown): value is {
  readonly workspaceId: string;
  readonly label: string;
  readonly version: 1;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.getPrototypeOf(value) === Object.prototype &&
    "workspaceId" in value &&
    "label" in value &&
    "version" in value &&
    typeof (value as { readonly workspaceId?: unknown }).workspaceId === "string" &&
    /^ws_[a-zA-Z0-9_-]+$/.test((value as { readonly workspaceId: string }).workspaceId) &&
    typeof (value as { readonly label?: unknown }).label === "string" &&
    (value as { readonly label: string }).label.length > 0 &&
    isSecretSafeWorkspaceText((value as { readonly label: string }).label) &&
    (value as { readonly version?: unknown }).version === 1
  );
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
  let highWater = 0;
  for (const event of events) {
    if (
      typeof event === "object" &&
      event !== null &&
      "sequence" in event
    ) {
      const sequence = (event as { readonly sequence?: unknown }).sequence;
      if (typeof sequence === "number" && Number.isInteger(sequence) && sequence > highWater) {
        highWater = sequence;
      }
    }
  }
  return highWater;
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
