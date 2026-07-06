import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { z } from "zod";

const secretKeyPattern = /token|secret|password|oauth|credential|api[_-]?key|private[_-]?key|session/i;

const portableWorkspaceManifestSchema = z
  .object({
    version: z.literal(1),
    layoutVersion: z.literal(1),
    workspaceId: z.string().regex(/^ws_[a-zA-Z0-9_-]+$/),
    label: z.string().min(1),
    createdAt: z.string().datetime(),
    createdBy: z.string().min(1),
    coreVersion: z.string().min(1),
    description: z.string().min(1).optional()
  })
  .strict();

export type PortableWorkspaceManifest = z.infer<typeof portableWorkspaceManifestSchema>;

export type WorkspaceMountDiagnosticCode =
  | "workspace-root-required"
  | "workspace-root-missing"
  | "workspace-root-not-directory"
  | "workspace-manifest-missing"
  | "workspace-manifest-invalid-json"
  | "workspace-manifest-invalid"
  | "workspace-manifest-unsupported-version"
  | "workspace-layout-conflict"
  | "workspace-ledger-unavailable"
  | "workspace-secret-material-rejected";

export interface WorkspaceMountDiagnostic {
  readonly code: WorkspaceMountDiagnosticCode;
  readonly message: string;
  readonly allowedRepairActions: readonly string[];
}

export interface PortableWorkspacePaths {
  readonly manifestPath: string;
  readonly ledgerPath: string;
  readonly blobRoot: string;
  readonly derivativeRoot: string;
  readonly jobRoot: string;
  readonly projectionRoot: string;
  readonly cacheRoot: string;
  readonly configRoot: string;
}

export interface MountedPortableWorkspace {
  readonly workspaceId: string;
  readonly label: string;
  readonly rootDir: string;
  readonly manifestPath: string;
  readonly paths: Omit<PortableWorkspacePaths, "manifestPath">;
}

export interface CreatePortableWorkspaceInput {
  readonly rootDir: string;
  readonly workspaceId: string;
  readonly label: string;
  readonly createdAt?: string;
  readonly createdBy: string;
  readonly coreVersion?: string;
  readonly description?: string;
}

export interface MountPortableWorkspaceInput {
  readonly rootDir: string;
}

export interface ReadPortableWorkspaceManifestInput {
  readonly manifestPath: string;
}

export type WorkspaceMountResult =
  | { readonly ok: true; readonly workspace: MountedPortableWorkspace }
  | { readonly ok: false; readonly diagnostic: WorkspaceMountDiagnostic };

export type PortableWorkspaceMountDiagnosticCode = WorkspaceMountDiagnosticCode;
export type PortableWorkspaceMountDiagnostic = WorkspaceMountDiagnostic;
export type PortableWorkspaceMountResult = WorkspaceMountResult;

export function portableWorkspacePaths(rootDir: string): PortableWorkspacePaths {
  const root = resolve(rootDir);
  const paths = Object.freeze({
    manifestPath: join(root, "cestus-workspace.json"),
    ledgerPath: join(root, "ledger", "ontology.sqlite"),
    blobRoot: join(root, "blobs"),
    derivativeRoot: join(root, "derivatives"),
    jobRoot: join(root, "jobs"),
    projectionRoot: join(root, "projections"),
    cacheRoot: join(root, "cache"),
    configRoot: join(root, "config")
  });

  for (const path of Object.values(paths)) {
    assertPathUnderRoot(root, path);
  }

  return paths;
}

export function createPortableWorkspace(input: CreatePortableWorkspaceInput): MountedPortableWorkspace {
  const rootDir = resolveRequiredRoot(input.rootDir);
  mkdirSync(rootDir, { recursive: true });
  assertDirectory(rootDir, "workspace root");

  const paths = portableWorkspacePaths(rootDir);
  for (const dir of workspaceDirectories(paths)) {
    mkdirSync(dir, { recursive: true });
    assertDirectory(dir, "workspace layout directory");
  }

  const manifestInput = {
    version: 1,
    layoutVersion: 1,
    workspaceId: input.workspaceId,
    label: input.label,
    createdAt: input.createdAt ?? new Date().toISOString(),
    createdBy: input.createdBy,
    coreVersion: input.coreVersion ?? "0.1.0",
    ...(input.description === undefined ? {} : { description: input.description })
  };

  const secretKey = findSecretLikeKey(manifestInput);
  if (secretKey !== undefined) {
    throw new Error(`Portable workspace manifest contains forbidden key ${secretKey}`);
  }

  const manifest = portableWorkspaceManifestSchema.parse(manifestInput);
  writeFileSync(paths.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });

  return mountedWorkspace(rootDir, manifest, paths);
}

export function readPortableWorkspaceManifest(input: ReadPortableWorkspaceManifestInput): PortableWorkspaceManifest {
  const parsed = JSON.parse(readFileSync(input.manifestPath, "utf8")) as unknown;
  const secretKey = findSecretLikeKey(parsed);
  if (secretKey !== undefined) {
    throw new Error(`Portable workspace manifest contains forbidden key ${secretKey}`);
  }
  return portableWorkspaceManifestSchema.parse(parsed);
}

export function mountPortableWorkspace(input: MountPortableWorkspaceInput): WorkspaceMountResult {
  const normalizedRoot = input.rootDir.trim();
  if (normalizedRoot.length === 0) {
    return failure("workspace-root-required", "Portable workspace root is required.", [
      "set CESTUS_WORKSPACE_ROOT",
      "pass --workspace <root>"
    ]);
  }

  const rootDir = resolve(normalizedRoot);
  if (!existsSync(rootDir)) {
    return failure("workspace-root-missing", "Portable workspace root does not exist.", [
      "mount the external drive",
      "check CESTUS_WORKSPACE_ROOT"
    ]);
  }
  if (!isDirectory(rootDir)) {
    return failure("workspace-root-not-directory", "Portable workspace root is not a directory.", [
      "choose a directory created by the portable workspace create command"
    ]);
  }

  const paths = portableWorkspacePaths(rootDir);
  if (!existsSync(paths.manifestPath)) {
    return failure("workspace-manifest-missing", "Portable workspace manifest is missing.", [
      "run the explicit portable workspace create command"
    ]);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(paths.manifestPath, "utf8"));
  } catch {
    return failure("workspace-manifest-invalid-json", "Portable workspace manifest is not valid JSON.", [
      "inspect cestus-workspace.json",
      "restore the workspace manifest from backup"
    ]);
  }

  const secretKey = findSecretLikeKey(parsed);
  if (secretKey !== undefined) {
    return failure("workspace-secret-material-rejected", `Portable workspace manifest contains forbidden key ${secretKey}.`, [
      "remove secret material from the workspace manifest",
      "store credentials outside the workspace manifest"
    ]);
  }

  if (hasUnsupportedVersion(parsed)) {
    return failure("workspace-manifest-unsupported-version", "Portable workspace manifest version is not supported.", [
      "open this workspace with a compatible Cestus version"
    ]);
  }

  const manifest = portableWorkspaceManifestSchema.safeParse(parsed);
  if (!manifest.success) {
    return failure("workspace-manifest-invalid", "Portable workspace manifest does not match the schema.", [
      "inspect cestus-workspace.json",
      "restore a valid workspace manifest"
    ]);
  }

  const conflict = firstLayoutConflict(paths);
  if (conflict !== undefined) {
    return failure("workspace-layout-conflict", `Portable workspace path ${conflict} is not a directory.`, [
      "restore the canonical workspace layout",
      "choose a valid portable workspace root"
    ]);
  }

  if (ledgerPathIsUnavailable(paths.ledgerPath)) {
    return failure("workspace-ledger-unavailable", "Portable workspace ledger path is unavailable.", [
      "restore ledger/ontology.sqlite as a SQLite database file",
      "choose a valid portable workspace root"
    ]);
  }

  return { ok: true, workspace: mountedWorkspace(rootDir, manifest.data, paths) };
}

function mountedWorkspace(
  rootDir: string,
  manifest: PortableWorkspaceManifest,
  paths: PortableWorkspacePaths
): MountedPortableWorkspace {
  return Object.freeze({
    workspaceId: manifest.workspaceId,
    label: manifest.label,
    rootDir,
    manifestPath: paths.manifestPath,
    paths: Object.freeze({
      ledgerPath: paths.ledgerPath,
      blobRoot: paths.blobRoot,
      derivativeRoot: paths.derivativeRoot,
      jobRoot: paths.jobRoot,
      projectionRoot: paths.projectionRoot,
      cacheRoot: paths.cacheRoot,
      configRoot: paths.configRoot
    })
  });
}

function resolveRequiredRoot(rootDir: string): string {
  const normalizedRoot = rootDir.trim();
  if (normalizedRoot.length === 0) {
    throw new Error("Portable workspace root is required.");
  }
  return resolve(normalizedRoot);
}

function workspaceDirectories(paths: PortableWorkspacePaths): readonly string[] {
  return [
    dirname(paths.ledgerPath),
    paths.blobRoot,
    paths.derivativeRoot,
    paths.jobRoot,
    paths.projectionRoot,
    paths.cacheRoot,
    paths.configRoot
  ];
}

function firstLayoutConflict(paths: PortableWorkspacePaths): string | undefined {
  for (const dir of workspaceDirectories(paths)) {
    if (!isDirectory(dir)) {
      return dir;
    }
  }
  return undefined;
}

function ledgerPathIsUnavailable(ledgerPath: string): boolean {
  if (!existsSync(ledgerPath)) {
    return false;
  }

  try {
    return statSync(ledgerPath).isDirectory();
  } catch {
    return true;
  }
}

function assertDirectory(path: string, label: string): void {
  if (!isDirectory(path)) {
    throw new Error(`${label} is not a directory: ${path}`);
  }
}

function isDirectory(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function assertPathUnderRoot(rootDir: string, path: string): void {
  const relativePath = relative(rootDir, path);
  if (relativePath === "" || relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    throw new Error(`Portable workspace path escaped root: ${path}`);
  }
}

function failure(
  code: WorkspaceMountDiagnosticCode,
  message: string,
  allowedRepairActions: readonly string[]
): WorkspaceMountResult {
  return {
    ok: false,
    diagnostic: Object.freeze({
      code,
      message,
      allowedRepairActions: Object.freeze([...allowedRepairActions])
    })
  };
}

function hasUnsupportedVersion(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    (record.version !== undefined && record.version !== 1) ||
    (record.layoutVersion !== undefined && record.layoutVersion !== 1)
  );
}

function findSecretLikeKey(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findSecretLikeKey(item);
      if (found !== undefined) {
        return found;
      }
    }
    return undefined;
  }

  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  for (const [key, child] of Object.entries(value)) {
    if (secretKeyPattern.test(key)) {
      return key;
    }
    const found = findSecretLikeKey(child);
    if (found !== undefined) {
      return found;
    }
  }

  return undefined;
}
