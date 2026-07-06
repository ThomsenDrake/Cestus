import { basename, isAbsolute, posix, win32 } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import {
  createWorkspaceOpsEnvelope,
  isSecretSafeWorkspaceText,
  mountStatusSchema,
  secretSafeWorkspaceTextSchema,
  workspaceRefSchema,
  type MountStatusDto,
  type ProposedRepairActionInput,
  type WorkspaceDiagnosticInput,
  type WorkspaceOpsEnvelope,
  type WorkspaceRefDto
} from "./contracts.js";
import { childPath, type WorkspaceFileSystem } from "./filesystem.js";

export const provisionalWorkspaceManifestName = "cestus-workspace.json" as const;
export const provisionalWorkspaceLayoutContractVersion = "portable-workspace-layout.v1-provisional" as const;

const provisionalWorkspaceManifestSchema = z.object({
  workspaceId: z.string().regex(/^ws_[a-zA-Z0-9_-]+$/),
  label: secretSafeWorkspaceTextSchema,
  version: z.literal(1)
}).strict();

const canonicalPortableWorkspaceManifestSchema = z.object({
  version: z.literal(1),
  layoutVersion: z.literal(1),
  workspaceId: z.string().regex(/^ws_[a-zA-Z0-9_-]+$/),
  label: secretSafeWorkspaceTextSchema,
  createdAt: z.string().datetime(),
  createdBy: secretSafeWorkspaceTextSchema,
  coreVersion: secretSafeWorkspaceTextSchema,
  description: secretSafeWorkspaceTextSchema.optional()
}).strict();

export type ProvisionalWorkspaceManifest = z.output<typeof provisionalWorkspaceManifestSchema>;

type WorkspaceManifestIdentity = {
  readonly workspaceId: string;
  readonly label: string;
  readonly version: 1;
};

export function parseProvisionalWorkspaceManifest(value: unknown): ProvisionalWorkspaceManifest | undefined {
  return parseStrictProvisionalWorkspaceManifest(value) ?? parseCanonicalPortableWorkspaceManifestIdentity(value);
}

export function parseWorkspaceManifestIdentity(value: unknown): WorkspaceManifestIdentity | undefined {
  return parseCanonicalPortableWorkspaceManifestIdentity(value) ?? parseStrictProvisionalWorkspaceManifest(value);
}

function parseStrictProvisionalWorkspaceManifest(value: unknown): ProvisionalWorkspaceManifest | undefined {
  const manifest = provisionalWorkspaceManifestSchema.safeParse(value);
  return manifest.success ? manifest.data : undefined;
}

function parseCanonicalPortableWorkspaceManifestIdentity(value: unknown): WorkspaceManifestIdentity | undefined {
  const manifest = canonicalPortableWorkspaceManifestSchema.safeParse(value);
  if (!manifest.success) {
    return undefined;
  }

  return {
    workspaceId: manifest.data.workspaceId,
    label: manifest.data.label,
    version: manifest.data.version
  };
}

export interface ResolveWorkspaceLayoutInput {
  readonly rootPath: string;
  readonly manifestName?: string;
  readonly expectedWorkspaceId?: string;
}

export interface ResolvedWorkspaceLayout {
  readonly layoutContractVersion: typeof provisionalWorkspaceLayoutContractVersion;
  readonly rootPath: string;
  readonly rootUri: string;
  readonly manifestPath: string;
  readonly ledgerPath: string;
  readonly blobRoot: string;
  readonly derivativeRoot: string;
  readonly jobRoot: string;
  readonly projectionRoot: string;
  readonly diagnosticsRoot: string;
  readonly backupRoot: string;
}

export type WorkspaceLayoutEnvelope = WorkspaceOpsEnvelope<MountStatusDto>;

export type WorkspaceLayoutResult = WorkspaceLayoutEnvelope & {
  readonly envelope: WorkspaceLayoutEnvelope;
  readonly mountStatus: MountStatusDto;
  readonly layout?: ResolvedWorkspaceLayout;
};

export async function resolveWorkspaceLayout(
  input: ResolveWorkspaceLayoutInput,
  fileSystem: WorkspaceFileSystem
): Promise<WorkspaceLayoutResult> {
  const rootUri = pathToSafeFileUri(input.rootPath);
  const rootExists = await safeExists(fileSystem, input.rootPath);
  if (rootExists === "unreadable") {
    return layoutResult({
      mountStatus: mountStatus(
        "unreadable",
        "Workspace root could not be inspected safely.",
        rootUri,
        ["detect drive", "diagnostics inspect"],
        "Inspect workspace drive permissions, then rerun drive detection."
      ),
      diagnostics: [
        workspaceDiagnostic(
          "diag_workspace_root_unreadable",
          "mount",
          "Workspace root could not be inspected safely."
        )
      ],
      proposedActions: [rerunDetectionAction("error")]
    });
  }

  if (!rootExists) {
    return layoutResult({
      mountStatus: mountStatus(
        "missing",
        "Workspace root is not available.",
        rootUri,
        ["detect drive"],
        "Mount the workspace drive, then rerun drive detection."
      ),
      diagnostics: [
        workspaceDiagnostic("diag_workspace_root_missing", "mount", "Workspace root is not available.")
      ],
      proposedActions: [
        proposedAction(
          "action_remount_workspace_drive",
          "remount-drive",
          "Remount the workspace drive and rerun detection.",
          "error",
          ["detect drive"]
        )
      ]
    });
  }

  const rootStats = await safeStat(fileSystem, input.rootPath);
  if (rootStats === "unreadable") {
    return layoutResult({
      mountStatus: mountStatus(
        "unreadable",
        "Workspace root could not be inspected safely.",
        rootUri,
        ["detect drive", "diagnostics inspect"],
        "Inspect workspace drive permissions, then rerun drive detection."
      ),
      diagnostics: [
        workspaceDiagnostic(
          "diag_workspace_root_unreadable",
          "mount",
          "Workspace root could not be inspected safely."
        )
      ],
      proposedActions: [rerunDetectionAction("error")]
    });
  }

  if (rootStats.kind !== "directory") {
    return layoutResult({
      mountStatus: mountStatus(
        "wrong-drive",
        "Selected workspace root is not a directory.",
        rootUri,
        ["detect drive"],
        "Select the correct workspace root, then rerun drive detection."
      ),
      diagnostics: [
        workspaceDiagnostic(
          "diag_workspace_root_not_directory",
          "mount",
          "Selected workspace root is not a directory."
        )
      ],
      proposedActions: [selectWorkspaceAction("error")]
    });
  }

  const manifestName = input.manifestName ?? provisionalWorkspaceManifestName;
  if (!isSafeManifestBasename(manifestName)) {
    return unsafeManifestNameResult(rootUri);
  }

  const manifestPath = childPath(input.rootPath, manifestName);
  const manifestExists = await safeExists(fileSystem, manifestPath);
  if (manifestExists === "unreadable") {
    return unreadableManifestResult(rootUri);
  }

  if (!manifestExists) {
    return layoutResult({
      mountStatus: mountStatus(
        "wrong-drive",
        "Workspace manifest was not found at the selected root.",
        rootUri,
        ["detect drive"],
        "Select the correct workspace root, then rerun drive detection."
      ),
      diagnostics: [
        workspaceDiagnostic(
          "diag_workspace_manifest_missing",
          "manifest",
          "Workspace manifest was not found at the selected root."
        )
      ],
      proposedActions: [selectWorkspaceAction("error")]
    });
  }

  const manifest = await readProvisionalManifest(fileSystem, manifestPath);
  if (manifest === "unreadable") {
    return unreadableManifestResult(rootUri);
  }

  if (
    input.expectedWorkspaceId !== undefined &&
    manifest.workspaceId !== input.expectedWorkspaceId
  ) {
    return layoutResult({
      mountStatus: mountStatus(
        "wrong-drive",
        "Workspace manifest does not match the expected workspace.",
        rootUri,
        ["detect drive"],
        "Select the expected workspace root, then rerun drive detection."
      ),
      diagnostics: [
        workspaceDiagnostic(
          "diag_workspace_manifest_identity_mismatch",
          "manifest",
          "Workspace manifest does not match the expected workspace."
        )
      ],
      proposedActions: [selectWorkspaceAction("error")]
    });
  }

  const rootPath = await safeRealpath(fileSystem, input.rootPath);
  if (rootPath === "unreadable") {
    return layoutResult({
      mountStatus: mountStatus(
        "unreadable",
        "Workspace root could not be resolved safely.",
        rootUri,
        ["detect drive", "diagnostics inspect"],
        "Inspect workspace drive permissions, then rerun drive detection."
      ),
      diagnostics: [
        workspaceDiagnostic(
          "diag_workspace_root_realpath_unreadable",
          "mount",
          "Workspace root could not be resolved safely."
        )
      ],
      proposedActions: [rerunDetectionAction("error")]
    });
  }

  const resolvedRootUri = pathToSafeFileUri(rootPath);
  const workspace = workspaceRefSchema.parse({
    workspaceId: manifest.workspaceId,
    label: manifest.label,
    manifestVersion: manifest.version,
    rootUri: resolvedRootUri,
    layoutContractVersion: provisionalWorkspaceLayoutContractVersion
  });
  const layout = createProvisionalWorkspaceLayout(rootPath, resolvedRootUri, manifestName);

  return layoutResult({
    workspace,
    mountStatus: mountStatus(
      "available",
      "Workspace is available.",
      undefined,
      ["verify workspace", "disk usage"],
      "Verify workspace state or inspect disk usage using this resolved workspace."
    ),
    layout
  });
}

export function createProvisionalWorkspaceLayout(
  rootPath: string,
  rootUri = pathToSafeFileUri(rootPath),
  manifestName: string = provisionalWorkspaceManifestName
): ResolvedWorkspaceLayout {
  return {
    layoutContractVersion: provisionalWorkspaceLayoutContractVersion,
    rootPath,
    rootUri,
    manifestPath: childPath(rootPath, manifestName),
    ledgerPath: childPath(rootPath, "ledger", "ontology.sqlite"),
    blobRoot: childPath(rootPath, "blobs"),
    derivativeRoot: childPath(rootPath, "derivatives"),
    jobRoot: childPath(rootPath, "jobs"),
    projectionRoot: childPath(rootPath, "projections"),
    diagnosticsRoot: childPath(rootPath, "diagnostics"),
    backupRoot: childPath(rootPath, "backups")
  };
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

async function safeStat(
  fileSystem: WorkspaceFileSystem,
  path: string
): Promise<Awaited<ReturnType<WorkspaceFileSystem["stat"]>> | "unreadable"> {
  try {
    return await fileSystem.stat(path);
  } catch {
    return "unreadable";
  }
}

async function safeRealpath(
  fileSystem: WorkspaceFileSystem,
  path: string
): Promise<string | "unreadable"> {
  try {
    return await fileSystem.realpath(path);
  } catch {
    return "unreadable";
  }
}

async function readProvisionalManifest(
  fileSystem: WorkspaceFileSystem,
  manifestPath: string
): Promise<WorkspaceManifestIdentity | "unreadable"> {
  try {
    return parseWorkspaceManifestIdentity(JSON.parse(await fileSystem.readText(manifestPath))) ?? "unreadable";
  } catch {
    return "unreadable";
  }
}

function unreadableManifestResult(rootUri: string): WorkspaceLayoutResult {
  return layoutResult({
    mountStatus: mountStatus(
      "unreadable",
      "Workspace manifest could not be parsed safely.",
      rootUri,
      ["detect drive", "diagnostics inspect"],
      "Inspect or replace the workspace manifest, then rerun drive detection."
    ),
    diagnostics: [
      workspaceDiagnostic(
        "diag_workspace_manifest_unreadable",
        "manifest",
        "Workspace manifest could not be parsed safely."
      )
    ],
    proposedActions: [rerunDetectionAction("error")]
  });
}

function unsafeManifestNameResult(rootUri: string): WorkspaceLayoutResult {
  return layoutResult({
    mountStatus: mountStatus(
      "wrong-drive",
      "Workspace manifest name must be a safe file basename.",
      rootUri,
      ["detect drive"],
      "Use a workspace manifest basename inside the selected root, then rerun drive detection."
    ),
    diagnostics: [
      workspaceDiagnostic(
        "diag_workspace_manifest_name_unsafe",
        "manifest",
        "Workspace manifest name must be a safe file basename."
      )
    ],
    proposedActions: [selectWorkspaceAction("error")]
  });
}

function layoutResult(input: {
  readonly workspace?: WorkspaceRefDto;
  readonly mountStatus: MountStatusDto;
  readonly layout?: ResolvedWorkspaceLayout;
  readonly diagnostics?: readonly WorkspaceDiagnosticInput[];
  readonly proposedActions?: readonly ProposedRepairActionInput[];
}): WorkspaceLayoutResult {
  const envelope = createWorkspaceOpsEnvelope({
    command: "detect drive",
    status: input.mountStatus.status === "available" ? "ready" : "blocked",
    ...(input.workspace === undefined ? {} : { workspace: input.workspace }),
    payload: input.mountStatus,
    diagnostics: input.diagnostics ?? [],
    proposedActions: input.proposedActions ?? []
  });

  return {
    ...envelope,
    envelope,
    mountStatus: input.mountStatus,
    ...(input.layout === undefined ? {} : { layout: input.layout })
  };
}

function mountStatus(
  status: MountStatusDto["status"],
  safeMessage: string,
  expectedRootUri: string | undefined,
  allowedNextCommands: MountStatusDto["nextCommandHints"][number]["allowedNextCommands"],
  safeReason: string
): MountStatusDto {
  return mountStatusSchema.parse({
    status,
    safeMessage,
    ...(expectedRootUri === undefined ? {} : { expectedRootUri }),
    nextCommandHints: [
      {
        allowedNextCommands,
        safeReason,
        requiresHumanApproval: false
      }
    ]
  });
}

function workspaceDiagnostic(
  diagnosticId: WorkspaceDiagnosticInput["diagnosticId"],
  category: WorkspaceDiagnosticInput["category"],
  message: string
): WorkspaceDiagnosticInput {
  return {
    diagnosticId,
    severity: "error",
    category,
    message,
    durable: false,
    repairHint: {
      allowedNextCommands: ["detect drive", "diagnostics inspect"],
      requiresHumanApproval: false
    }
  };
}

function proposedAction(
  actionId: ProposedRepairActionInput["actionId"],
  kind: ProposedRepairActionInput["kind"],
  title: string,
  severity: ProposedRepairActionInput["severity"],
  allowedNextCommands: ProposedRepairActionInput["allowedNextCommands"]
): ProposedRepairActionInput {
  return {
    actionId,
    kind,
    title,
    severity,
    requiresHumanApproval: false,
    mutatesCanonicalState: false,
    allowedNextCommands
  };
}

function selectWorkspaceAction(severity: ProposedRepairActionInput["severity"]): ProposedRepairActionInput {
  return proposedAction(
    "action_select_workspace_root",
    "select-workspace",
    "Select the correct workspace root and rerun detection.",
    severity,
    ["detect drive"]
  );
}

function rerunDetectionAction(severity: ProposedRepairActionInput["severity"]): ProposedRepairActionInput {
  return proposedAction(
    "action_rerun_workspace_detection",
    "rerun-verify",
    "Rerun workspace detection after access is restored.",
    severity,
    ["detect drive", "diagnostics inspect"]
  );
}

function pathToSafeFileUri(path: string): string {
  const uri = pathToFileURL(path).href;
  return isSecretSafeWorkspaceText(uri) ? uri : "workspace://redacted-path";
}

function isSafeManifestBasename(manifestName: string): boolean {
  return (
    manifestName.length > 0 &&
    manifestName !== "." &&
    manifestName !== ".." &&
    !manifestName.includes("\0") &&
    !isAbsolute(manifestName) &&
    !win32.isAbsolute(manifestName) &&
    basename(manifestName) === manifestName &&
    posix.basename(manifestName) === manifestName &&
    win32.basename(manifestName) === manifestName
  );
}
