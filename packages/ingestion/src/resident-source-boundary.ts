import { createHash } from "node:crypto";
import { lstatSync, readdirSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { MountedWorkspace } from "./mount-contract.js";

export type ResidentSourceMetadataEntryType = "file" | "directory" | "symlink" | "other";

/** Deliberately metadata-only: this boundary has no content-read operation. */
export interface ResidentSourceMetadataFilesystem {
  readonly listDirectory: (absolutePath: string) => readonly string[];
  readonly lstat: (absolutePath: string) => {
    readonly path?: string;
    readonly type: ResidentSourceMetadataEntryType;
    readonly sizeBytes: number;
    readonly mtimeMs: number;
    readonly device: number;
    readonly inode: number;
  };
}

export interface ResidentSourceMetadata {
  readonly relativePath: string;
  readonly type: "regular-file" | "symlink" | "other";
  readonly sizeBytes: number;
  readonly mtimeMs: number;
  readonly device: number;
  readonly inode: number;
  readonly symlink: boolean;
}

export interface ResidentSourceBoundaryServiceInput {
  readonly workspace: MountedWorkspace;
  readonly filesystem?: ResidentSourceMetadataFilesystem;
  /** A mounted-runtime caller supplies this to reject replaced/unavailable mounts before reads/writes. */
  readonly assertCurrent?: () => void | Promise<void>;
}

export interface ResidentSourceDiscoveryInput {
  readonly workflowId: string;
  readonly sourceCollectionId: string;
  readonly sourceIdentity: string;
  readonly sourceRoot: string;
}

export interface ResidentSourceDiscoveryPreview {
  readonly workflowId: string;
  readonly workspaceId: string;
  readonly sourceCollectionId: string;
  readonly sourceIdentity: string;
  readonly sourceRootHash: `sha256:${string}`;
  readonly discoveryArtifactHash: `sha256:${string}`;
  readonly discoveryHash: `sha256:${string}`;
  readonly regularFileCount: number;
  readonly symlinkCount: number;
  readonly otherEntryCount: number;
  readonly totalBytes: number;
}

export interface ResidentSourceDiscoveryResult {
  readonly workflowId: string;
  readonly discoveryArtifactHash: `sha256:${string}`;
  readonly discoveryHash: `sha256:${string}`;
  readonly preview: ResidentSourceDiscoveryPreview;
}

export interface ResidentSourceBoundaryProposalInput {
  readonly workflowId: string;
  readonly discoveryArtifactHash: `sha256:${string}`;
  readonly includedRelativePaths: readonly string[];
  readonly excludedRelativePaths: readonly string[];
  readonly archivePolicy?: "reject";
}

export interface ResidentSourceBoundaryPreview {
  readonly workflowId: string;
  readonly workspaceId: string;
  readonly sourceCollectionId: string;
  readonly sourceIdentity: string;
  readonly sourceRootHash: `sha256:${string}`;
  readonly discoveryArtifactHash: `sha256:${string}`;
  readonly discoveryHash: `sha256:${string}`;
  readonly manifestArtifactHash: `sha256:${string}`;
  readonly manifestHash: `sha256:${string}`;
  readonly archivePolicy: "reject";
  readonly includedFileCount: number;
  readonly excludedFileCount: number;
  readonly includedBytes: number;
  readonly excludedBytes: number;
  readonly totalBytes: number;
}

export interface ResidentSourceBoundaryResult extends ResidentSourceBoundaryPreview {}

export interface ResidentSourceBoundaryApprovalBinding {
  readonly workflowId: string;
  readonly workspaceId: string;
  readonly sourceCollectionId: string;
  readonly sourceIdentity: string;
  readonly sourceRootHash: `sha256:${string}`;
  readonly discoveryArtifactHash: `sha256:${string}`;
  readonly discoveryHash: `sha256:${string}`;
  readonly manifestArtifactHash: `sha256:${string}`;
  readonly manifestHash: `sha256:${string}`;
  readonly regularFileCount: number;
  readonly includedFileCount: number;
  readonly excludedFileCount: number;
  readonly totalBytes: number;
}

interface ProtectedDiscoveryArtifact {
  readonly schemaVersion: "resident-source-discovery.v1";
  readonly workflowId: string;
  readonly workspaceId: string;
  readonly sourceCollectionId: string;
  readonly sourceIdentity: string;
  readonly sourceRoot: string;
  readonly sourceRootHash: `sha256:${string}`;
  readonly entries: readonly ResidentSourceMetadata[];
  readonly discoveryHash: `sha256:${string}`;
}

interface ProtectedBoundaryManifest {
  readonly schemaVersion: "resident-source-boundary-manifest.v1";
  readonly workflowId: string;
  readonly workspaceId: string;
  readonly sourceCollectionId: string;
  readonly sourceIdentity: string;
  readonly sourceRootHash: `sha256:${string}`;
  readonly discoveryArtifactHash: `sha256:${string}`;
  readonly discoveryHash: `sha256:${string}`;
  readonly archivePolicy: "reject";
  readonly included: readonly ResidentSourceMetadata[];
  readonly excluded: readonly ResidentSourceMetadata[];
  readonly counts: { readonly includedFiles: number; readonly excludedFiles: number; readonly regularFiles: number };
  readonly byteTotals: { readonly included: number; readonly excluded: number; readonly total: number };
  readonly manifestHash: `sha256:${string}`;
}

export interface ResidentSourceBoundaryService {
  discover(input: ResidentSourceDiscoveryInput): Promise<ResidentSourceDiscoveryResult>;
  proposeBoundary(input: ResidentSourceBoundaryProposalInput): Promise<ResidentSourceBoundaryResult>;
  readProtectedDiscovery(input: { readonly actorKind: "human" | "agent" | "system"; readonly discoveryArtifactHash: `sha256:${string}` }): Promise<ProtectedDiscoveryArtifact>;
  readProtectedBoundary(input: { readonly actorKind: "human" | "agent" | "system"; readonly manifestArtifactHash: `sha256:${string}` }): Promise<ProtectedBoundaryManifest>;
}

export function createResidentSourceBoundaryService(
  input: ResidentSourceBoundaryServiceInput
): ResidentSourceBoundaryService {
  const filesystem = input.filesystem ?? nodeMetadataFilesystem;
  const workflowBindings = new Map<string, { readonly workspaceId: string; readonly sourceCollectionId: string; readonly sourceIdentity: string; readonly sourceRootHash: `sha256:${string}` }>();
  const assertReady = async (write: boolean) => {
    await input.assertCurrent?.();
    if (!input.workspace.capabilities.canReadLedger || (write && !input.workspace.capabilities.canWriteDerivatives)) {
      throw new Error("Mounted workspace is unavailable or does not permit protected derivative storage.");
    }
  };

  return Object.freeze({
    async discover(value) {
      await assertReady(true);
      assertIdentity(value.workflowId, "workflow id");
      assertIdentity(value.sourceCollectionId, "source collection id");
      assertIdentity(value.sourceIdentity, "source identity");
      const sourceRoot = resolve(value.sourceRoot);
      const entries = collectMetadata(filesystem, sourceRoot);
      const sourceRootHash = digest(sourceRoot);
      const existing = workflowBindings.get(value.workflowId);
      if (existing !== undefined && (
        existing.workspaceId !== input.workspace.workspaceId ||
        existing.sourceCollectionId !== value.sourceCollectionId ||
        existing.sourceIdentity !== value.sourceIdentity ||
        existing.sourceRootHash !== sourceRootHash
      )) {
        throw new Error("Workflow is already bound to a different mounted resident source.");
      }
      const unsigned = {
        schemaVersion: "resident-source-discovery.v1" as const,
        workflowId: value.workflowId,
        workspaceId: input.workspace.workspaceId,
        sourceCollectionId: value.sourceCollectionId,
        sourceIdentity: value.sourceIdentity,
        sourceRoot,
        sourceRootHash,
        entries
      };
      const artifact: ProtectedDiscoveryArtifact = Object.freeze({ ...unsigned, discoveryHash: digest(stableJson(unsigned)) });
      // All hostile filesystem input has been confined before this sole write.
      await assertReady(true);
      const stored = await input.workspace.derivativeStore.put(Buffer.from(stableJson(artifact)));
      workflowBindings.set(value.workflowId, Object.freeze({
        workspaceId: input.workspace.workspaceId,
        sourceCollectionId: value.sourceCollectionId,
        sourceIdentity: value.sourceIdentity,
        sourceRootHash
      }));
      const totals = totalsFor(entries);
      return Object.freeze({
        workflowId: value.workflowId,
        discoveryArtifactHash: stored.contentHash,
        discoveryHash: artifact.discoveryHash,
        preview: Object.freeze({
          workflowId: value.workflowId,
          workspaceId: input.workspace.workspaceId,
          sourceCollectionId: value.sourceCollectionId,
          sourceIdentity: value.sourceIdentity,
          sourceRootHash,
          discoveryArtifactHash: stored.contentHash,
          discoveryHash: artifact.discoveryHash,
          ...totals
        })
      });
    },

    async proposeBoundary(value) {
      await assertReady(true);
      assertIdentity(value.workflowId, "workflow id");
      if (value.archivePolicy !== undefined && value.archivePolicy !== "reject") throw new Error("Archive policy must be reject.");
      const discovery = await readDiscovery(input.workspace, value.discoveryArtifactHash);
      if (discovery.workspaceId !== input.workspace.workspaceId || discovery.workflowId !== value.workflowId) {
        throw new Error("Boundary proposal does not bind the current mounted discovery.");
      }
      const regular = discovery.entries.filter((entry) => entry.type === "regular-file");
      const included = exactPartition(value.includedRelativePaths, regular, "included");
      const excluded = exactPartition(value.excludedRelativePaths, regular, "excluded");
      const both = new Set(included.map((entry) => entry.relativePath));
      if (excluded.some((entry) => both.has(entry.relativePath)) || included.length + excluded.length !== regular.length) {
        throw new Error("Boundary must partition every discovered regular file exactly once.");
      }
      if (included.some((entry) => isArchivePath(entry.relativePath))) {
        throw new Error("Archive inclusion is forbidden by the reject archive policy.");
      }
      const includedBytes = sumBytes(included);
      const excludedBytes = sumBytes(excluded);
      const unsigned = {
        schemaVersion: "resident-source-boundary-manifest.v1" as const,
        workflowId: discovery.workflowId,
        workspaceId: discovery.workspaceId,
        sourceCollectionId: discovery.sourceCollectionId,
        sourceIdentity: discovery.sourceIdentity,
        sourceRootHash: discovery.sourceRootHash,
        discoveryArtifactHash: value.discoveryArtifactHash,
        discoveryHash: discovery.discoveryHash,
        archivePolicy: "reject" as const,
        included,
        excluded,
        counts: { includedFiles: included.length, excludedFiles: excluded.length, regularFiles: regular.length },
        byteTotals: { included: includedBytes, excluded: excludedBytes, total: includedBytes + excludedBytes }
      };
      const manifest: ProtectedBoundaryManifest = Object.freeze({ ...unsigned, manifestHash: digest(stableJson(unsigned)) });
      await assertReady(true);
      const stored = await input.workspace.derivativeStore.put(Buffer.from(stableJson(manifest)));
      return Object.freeze({
        workflowId: discovery.workflowId,
        workspaceId: discovery.workspaceId,
        sourceCollectionId: discovery.sourceCollectionId,
        sourceIdentity: discovery.sourceIdentity,
        sourceRootHash: discovery.sourceRootHash,
        discoveryArtifactHash: value.discoveryArtifactHash,
        discoveryHash: discovery.discoveryHash,
        manifestArtifactHash: stored.contentHash,
        manifestHash: manifest.manifestHash,
        archivePolicy: "reject" as const,
        includedFileCount: included.length,
        excludedFileCount: excluded.length,
        includedBytes,
        excludedBytes,
        totalBytes: includedBytes + excludedBytes
      });
    },

    async readProtectedDiscovery(value) {
      await assertReady(false);
      requireHuman(value.actorKind);
      return await readDiscovery(input.workspace, value.discoveryArtifactHash);
    },

    async readProtectedBoundary(value) {
      await assertReady(false);
      requireHuman(value.actorKind);
      return await readBoundary(input.workspace, value.manifestArtifactHash);
    }
  });
}

/** Consume-time validation for the existing approval gateway; it never grants an import permit. */
export async function assertResidentSourceBoundaryApprovalCurrent(input: {
  readonly workspace: MountedWorkspace;
  readonly binding: ResidentSourceBoundaryApprovalBinding;
  readonly assertCurrent?: () => void | Promise<void>;
}): Promise<void> {
  const service = createResidentSourceBoundaryService({
    workspace: input.workspace,
    ...(input.assertCurrent === undefined ? {} : { assertCurrent: input.assertCurrent })
  });
  const discovery = await service.readProtectedDiscovery({
    actorKind: "human",
    discoveryArtifactHash: input.binding.discoveryArtifactHash
  });
  const manifest = await service.readProtectedBoundary({
    actorKind: "human",
    manifestArtifactHash: input.binding.manifestArtifactHash
  });
  if (
    discovery.workflowId !== input.binding.workflowId ||
    discovery.workspaceId !== input.binding.workspaceId ||
    discovery.sourceCollectionId !== input.binding.sourceCollectionId ||
    discovery.sourceIdentity !== input.binding.sourceIdentity ||
    discovery.sourceRootHash !== input.binding.sourceRootHash ||
    discovery.discoveryHash !== input.binding.discoveryHash ||
    manifest.workflowId !== input.binding.workflowId ||
    manifest.workspaceId !== input.binding.workspaceId ||
    manifest.sourceCollectionId !== input.binding.sourceCollectionId ||
    manifest.sourceIdentity !== input.binding.sourceIdentity ||
    manifest.sourceRootHash !== input.binding.sourceRootHash ||
    manifest.discoveryArtifactHash !== input.binding.discoveryArtifactHash ||
    manifest.discoveryHash !== input.binding.discoveryHash ||
    manifest.manifestHash !== input.binding.manifestHash ||
    manifest.counts.regularFiles !== input.binding.regularFileCount ||
    manifest.counts.includedFiles !== input.binding.includedFileCount ||
    manifest.counts.excludedFiles !== input.binding.excludedFileCount ||
    manifest.byteTotals.total !== input.binding.totalBytes
  ) {
    throw new Error("Resident source boundary approval no longer binds the current protected preview.");
  }
}

function collectMetadata(filesystem: ResidentSourceMetadataFilesystem, sourceRoot: string): readonly ResidentSourceMetadata[] {
  const collected: ResidentSourceMetadata[] = [];
  const visit = (directory: string) => {
    for (const child of filesystem.listDirectory(directory)) {
      if (typeof child !== "string" || child.length === 0) throw new Error("Directory enumeration returned an invalid path.");
      const candidate = resolve(directory, child);
      const relativePath = confinedRelativePath(sourceRoot, candidate);
      const stat = filesystem.lstat(candidate);
      if (stat.path !== undefined && resolve(stat.path) !== candidate) throw new Error("Metadata result is not confined to its enumerated path.");
      if (!Number.isSafeInteger(stat.sizeBytes) || stat.sizeBytes < 0 || !Number.isFinite(stat.mtimeMs) ||
        !Number.isSafeInteger(stat.device) || !Number.isSafeInteger(stat.inode)) throw new Error("Filesystem metadata is invalid.");
      if (stat.type === "directory") {
        visit(candidate);
      } else {
        collected.push(Object.freeze({
          relativePath,
          type: stat.type === "file" ? "regular-file" : stat.type === "symlink" ? "symlink" : "other",
          sizeBytes: stat.sizeBytes,
          mtimeMs: stat.mtimeMs,
          device: stat.device,
          inode: stat.inode,
          symlink: stat.type === "symlink"
        }));
      }
    }
  };
  visit(sourceRoot);
  const unique = new Set<string>();
  for (const entry of collected) {
    if (unique.has(entry.relativePath)) throw new Error("Directory discovery returned duplicate relative paths.");
    unique.add(entry.relativePath);
  }
  return Object.freeze([...collected].sort((left, right) => compareCodeUnits(left.relativePath, right.relativePath)));
}

function exactPartition(paths: readonly string[], entries: readonly ResidentSourceMetadata[], name: string): readonly ResidentSourceMetadata[] {
  const byPath = new Map(entries.map((entry) => [entry.relativePath, entry]));
  const seen = new Set<string>();
  return Object.freeze(paths.map((path) => {
    if (typeof path !== "string" || !isSafeRelativePath(path)) throw new Error(`${name} boundary path is not a confined relative path.`);
    if (seen.has(path)) throw new Error(`${name} boundary contains a duplicate path.`);
    seen.add(path);
    const entry = byPath.get(path);
    if (entry === undefined || entry.type !== "regular-file" || entry.symlink) {
      throw new Error(`${name} boundary contains an undiscovered or non-regular path.`);
    }
    return entry;
  }).sort((left, right) => compareCodeUnits(left.relativePath, right.relativePath)));
}

async function readDiscovery(workspace: MountedWorkspace, hash: `sha256:${string}`): Promise<ProtectedDiscoveryArtifact> {
  const bytes = await workspace.derivativeStore.get(hash);
  if (digestBytes(bytes) !== hash) throw new Error("Protected discovery artifact is not content-addressed.");
  const parsed = parseProtectedArtifact(bytes, "resident-source-discovery.v1") as ProtectedDiscoveryArtifact;
  const { discoveryHash, ...unsigned } = parsed;
  if (digest(stableJson(unsigned)) !== discoveryHash) throw new Error("Protected discovery hash is invalid.");
  return parsed;
}

async function readBoundary(workspace: MountedWorkspace, hash: `sha256:${string}`): Promise<ProtectedBoundaryManifest> {
  const bytes = await workspace.derivativeStore.get(hash);
  if (digestBytes(bytes) !== hash) throw new Error("Protected boundary manifest is not content-addressed.");
  const parsed = parseProtectedArtifact(bytes, "resident-source-boundary-manifest.v1") as ProtectedBoundaryManifest;
  const { manifestHash, ...unsigned } = parsed;
  if (digest(stableJson(unsigned)) !== manifestHash) throw new Error("Protected boundary manifest hash is invalid.");
  return parsed;
}

function parseProtectedArtifact(bytes: Buffer, schemaVersion: string): object {
  let parsed: unknown;
  try { parsed = JSON.parse(bytes.toString("utf8")); } catch { throw new Error("Protected derivative artifact is malformed."); }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed) || (parsed as { schemaVersion?: unknown }).schemaVersion !== schemaVersion) {
    throw new Error("Protected derivative artifact has an unexpected schema.");
  }
  return parsed;
}

const nodeMetadataFilesystem: ResidentSourceMetadataFilesystem = Object.freeze({
  listDirectory: (absolutePath) => readdirSync(absolutePath),
  lstat: (absolutePath) => {
    const stat = lstatSync(absolutePath);
    return {
      path: absolutePath,
      type: stat.isFile() ? "file" : stat.isDirectory() ? "directory" : stat.isSymbolicLink() ? "symlink" : "other",
      sizeBytes: stat.size,
      mtimeMs: stat.mtimeMs,
      device: stat.dev,
      inode: stat.ino
    };
  }
});

function confinedRelativePath(sourceRoot: string, candidate: string): string {
  const path = relative(sourceRoot, candidate);
  if (!isSafeRelativePath(path)) throw new Error("Discovered path escapes the selected source root.");
  return path.split(sep).join("/");
}

function isSafeRelativePath(path: string): boolean {
  return path.length > 0 && !isAbsolute(path) && path !== ".." && !path.startsWith(`..${sep}`) && !path.split(/[\\/]/).some((segment) => segment === "" || segment === "." || segment === "..");
}

function totalsFor(entries: readonly ResidentSourceMetadata[]) {
  const regular = entries.filter((entry) => entry.type === "regular-file");
  return {
    regularFileCount: regular.length,
    symlinkCount: entries.filter((entry) => entry.type === "symlink").length,
    otherEntryCount: entries.filter((entry) => entry.type === "other").length,
    totalBytes: sumBytes(regular)
  };
}

function sumBytes(entries: readonly ResidentSourceMetadata[]): number { return entries.reduce((total, entry) => total + entry.sizeBytes, 0); }
function digest(value: string): `sha256:${string}` { return `sha256:${createHash("sha256").update(value).digest("hex")}`; }
function digestBytes(value: Buffer): `sha256:${string}` { return `sha256:${createHash("sha256").update(value).digest("hex")}`; }
function stableJson(value: unknown): string { return JSON.stringify(stable(value)); }
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => compareCodeUnits(a, b)).map(([key, item]) => [key, stable(item)]));
  return value;
}
function compareCodeUnits(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function assertIdentity(value: string, label: string): void { if (!/^[A-Za-z0-9_-]{3,200}$/.test(value)) throw new Error(`Invalid ${label}.`); }
function requireHuman(actorKind: string): void { if (actorKind !== "human") throw new Error("Protected resident boundary readback requires an authenticated human actor."); }
function isArchivePath(path: string): boolean { return /\.(zip|tar|tgz|gz|bz2|xz|7z|rar)$/i.test(path); }
