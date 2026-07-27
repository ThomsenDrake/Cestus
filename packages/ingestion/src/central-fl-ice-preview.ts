import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { KnowledgeEvent } from "../../ontology/src/contracts.js";
import { buildOntologyBootstrapDossier } from "../../ontology-bootstrap/src/dossier-builder.js";
import {
  createStagingApprovalPreview,
  createStagingExecutionPreview
} from "../../ontology-bootstrap/src/tool-previews.js";
import { createPortableWorkspace } from "../../workspace/src/index.js";
import {
  createLegacyImportRuntime,
  type LegacyImportRuntime,
  type LegacyReportData,
  type LegacyStagingPreviewData
} from "./legacy-runtime.js";
import { stableLocalFilesystemOccurrenceId } from "./local-filesystem.js";
import type { MountedWorkspace } from "./mount-contract.js";
import {
  createPortableIngestionMountResolver
} from "./portable-mount.js";
import type { IngestionWorkspaceMountResolver } from "./mount-contract.js";
import { buildIngestionProjection } from "./projection.js";
import { buildLegacyImportProjection } from "./legacy-projection.js";
import {
  sha256,
  stableJson,
  type LegacyMigrationReport
} from "./legacy-report.js";

/**
 * Fixed authority for the development-only Central Florida ICE preview.
 *
 * This module is deliberately not exported by the ingestion package index. A
 * caller must opt in by importing this preview-specific path directly.
 */
export const CENTRAL_FL_ICE_PREVIEW = Object.freeze({
  sourceRoot: "/mnt/cestus_legacy_ssd/Cestus/central-fl-ice-workspace",
  sourceMount: "/mnt/cestus_legacy_ssd",
  sourceDevice: "/dev/sda2",
  sourceFileSystem: "apfs",
  requiredSourceMountOptions: Object.freeze([
    "ro",
    "nosuid",
    "nodev",
    "noexec",
    "uid=1000",
    "gid=1000"
  ]),
  expectedFileCount: 136,
  destinationRoot: "/home/drake/.local/share/cestus/previews/central-fl-ice-engineering-preview",
  workspaceId: "ws_central_fl_ice_preview",
  sourceCollectionId: "src_central_fl_ice_legacy",
  scanBatchId: "scan_central_fl_ice_preview_001",
  importBatchId: "imp_central_fl_ice_preview_001",
  stagingBatchId: "legacy_stage_central_fl_ice_preview_001",
  codeBaseSha: "dc05c43c4b9a592d0396acd034bfc32e177fd09a"
} as const);

interface PreviewPolicy {
  readonly sourceRoot: string;
  readonly sourceMount: string;
  readonly sourceDevice: string;
  readonly sourceFileSystem: string;
  readonly requiredSourceMountOptions: readonly string[];
  readonly expectedFileCount: number;
  readonly destinationRoot: string;
  readonly workspaceId: string;
  readonly sourceCollectionId: string;
  readonly scanBatchId: string;
  readonly importBatchId: string;
  readonly stagingBatchId: string;
  readonly codeBaseSha: string;
}

export type PreviewPathKind = "directory" | "file" | "symlink" | "other";

export interface PreviewPathMetadata {
  readonly kind: PreviewPathKind;
  readonly deviceId: string;
  readonly sizeBytes: number;
  readonly inode: string;
}

export interface PreviewFilesystemPort {
  exists(path: string): boolean;
  realpath(path: string): string;
  lstat(path: string): PreviewPathMetadata;
  readDirectory(path: string): readonly string[];
  readFile(path: string): Uint8Array;
}

export interface PreviewMountRecord {
  readonly target: string;
  readonly source: string;
  readonly fileSystem: string;
  readonly options: readonly string[];
  readonly deviceId: string;
}

export interface PreviewMountInspectionPort {
  inspect(path: string): PreviewMountRecord;
}

export interface CentralFloridaIcePreviewDependencies {
  readonly filesystem: PreviewFilesystemPort;
  readonly mounts: PreviewMountInspectionPort;
}

export interface CentralFloridaIcePreviewInspectionInput {
  readonly codeSha: string;
}

export type PreviewPreservationStatus = "current" | "archived" | "superseded";
export type PreviewScanStatus = "new" | "duplicate";

export interface PreviewRawImportCandidate {
  readonly occurrenceId: string;
  readonly sourcePath: string;
  readonly contentHash: `sha256:${string}`;
  readonly mediaType: string;
  readonly sizeBytes: number;
  readonly deviceId: string;
  readonly inode: string;
  readonly scanStatus: PreviewScanStatus;
  readonly preservationStatus: PreviewPreservationStatus;
  readonly sourceCollectionId: string;
  readonly scanBatchId: string;
}

export interface PreviewExclusion {
  readonly classification: string;
  readonly count: number;
}

export interface PreviewSourceIdentity {
  readonly rootRealpath: string;
  readonly mountTarget: string;
  readonly mountSource: string;
  readonly fileSystem: string;
  readonly mountOptions: readonly string[];
  readonly mountDeviceId: string;
  readonly rootDeviceId: string;
  readonly fileCount: number;
  readonly totalBytes: number;
}

export interface PreviewDestinationIdentity {
  readonly destinationPath: string;
  readonly nearestExistingParent: string;
  readonly mountTarget: string;
  readonly mountSource: string;
  readonly fileSystem: string;
  readonly mountOptions: readonly string[];
  readonly mountDeviceId: string;
  readonly parentDeviceId: string;
  readonly initiallyPresent: boolean;
}

export interface CentralFloridaIceCandidateInspection {
  readonly version: 1;
  readonly workspaceId: string;
  readonly sourceCollectionId: string;
  readonly scanBatchId: string;
  readonly importBatchId: string;
  readonly stagingBatchId: string;
  readonly sourceIdentity: PreviewSourceIdentity;
  readonly destinationIdentity: PreviewDestinationIdentity;
  readonly code: {
    readonly baseSha: string;
    readonly codeSha: string;
  };
  readonly candidates: readonly PreviewRawImportCandidate[];
  readonly exclusions: readonly PreviewExclusion[];
  /**
   * Exact stable JSON bytes hashed by candidateSetHash.
   *
   * It intentionally excludes candidateSetHash itself.
   */
  readonly canonicalCandidateMaterial: string;
  readonly candidateSetHash: `sha256:${string}`;
}

export type PreviewPreflightErrorCode =
  | "POLICY_INVALID"
  | "CODE_SHA_INVALID"
  | "SOURCE_REALPATH_MISMATCH"
  | "SOURCE_ROOT_INVALID"
  | "SOURCE_DEVICE_MISMATCH"
  | "SOURCE_MOUNT_MISMATCH"
  | "SOURCE_FILESYSTEM_MISMATCH"
  | "SOURCE_MOUNT_OPTIONS_MISMATCH"
  | "SOURCE_MOUNT_WRITABLE"
  | "DESTINATION_ON_SOURCE_MOUNT"
  | "DESTINATION_INVALID"
  | "DESTINATION_COLLISION"
  | "DESTINATION_DEVICE_MISMATCH"
  | "DESTINATION_NOT_WRITABLE"
  | "AMBIGUOUS_SOURCE_PATH"
  | "FORBIDDEN_MATERIAL"
  | "ARCHIVE_CONTAINER_FORBIDDEN"
  | "UNSAFE_FILE_TYPE"
  | "SOURCE_MOUNT_CROSSING"
  | "SOURCE_FILE_COUNT_MISMATCH"
  | "SOURCE_CHANGED_DURING_HASH";

export class PreviewPreflightError extends Error {
  readonly code: PreviewPreflightErrorCode;

  constructor(code: PreviewPreflightErrorCode, message: string) {
    super(message);
    this.name = "PreviewPreflightError";
    this.code = code;
  }
}

interface InventoriedFile {
  readonly absolutePath: string;
  readonly sourcePath: string;
  readonly metadata: PreviewPathMetadata;
}

/**
 * Performs both metadata-first fail-closed preflight and a deterministic hash
 * pass. It has no write capability: callers may persist the returned material
 * only after this function succeeds.
 */
export function inspectCentralFloridaIceCandidates(
  dependencies: CentralFloridaIcePreviewDependencies,
  input: CentralFloridaIcePreviewInspectionInput
): CentralFloridaIceCandidateInspection {
  return inspectCentralFloridaIceCandidateMaterial(dependencies, input, "empty-destination");
}

/**
 * Repeats the full source authority and byte-hash pass after the canonical
 * preview workspace exists. Workspace identity is validated separately by the
 * portable mount resolver; this boundary permits only that exact destination
 * directory to be non-empty.
 */
export function revalidateCentralFloridaIceCandidates(
  dependencies: CentralFloridaIcePreviewDependencies,
  input: CentralFloridaIcePreviewInspectionInput
): CentralFloridaIceCandidateInspection {
  return inspectCentralFloridaIceCandidateMaterial(dependencies, input, "mounted-preview");
}

function inspectCentralFloridaIceCandidateMaterial(
  dependencies: CentralFloridaIcePreviewDependencies,
  input: CentralFloridaIcePreviewInspectionInput,
  destinationMode: "empty-destination" | "mounted-preview"
): CentralFloridaIceCandidateInspection {
  const policy = CENTRAL_FL_ICE_PREVIEW;
  const inspectionInput = snapshotInspectionInput(input);
  validatePolicy(policy);
  validateCodeSha(inspectionInput.codeSha);

  const source = inspectSourceAuthority(dependencies, policy);
  const destinationIdentity = inspectDestinationAuthority(
    dependencies,
    policy,
    source.mount,
    destinationMode
  );
  const inventoriedFiles = inventorySourceTree(dependencies, policy, source.mount);

  if (inventoriedFiles.length !== policy.expectedFileCount) {
    fail(
      "SOURCE_FILE_COUNT_MISMATCH",
      "Selected source file count does not match approved preview authority"
    );
  }

  const candidates = hashInventoriedFiles(dependencies, policy, source.mount, inventoriedFiles);
  const sourceIdentity: PreviewSourceIdentity = Object.freeze({
    rootRealpath: source.rootRealpath,
    mountTarget: source.mount.target,
    mountSource: source.mount.source,
    fileSystem: source.mount.fileSystem,
    mountOptions: Object.freeze(sortStrings(source.mount.options)),
    mountDeviceId: source.mount.deviceId,
    rootDeviceId: source.rootMetadata.deviceId,
    fileCount: candidates.length,
    totalBytes: candidates.reduce((total, candidate) => total + candidate.sizeBytes, 0)
  });
  const code = Object.freeze({
    baseSha: policy.codeBaseSha,
    codeSha: inspectionInput.codeSha
  });
  const exclusions: readonly PreviewExclusion[] = Object.freeze([]);
  const canonicalCandidateMaterial = stableJson({
    version: 1 as const,
    workspaceId: policy.workspaceId,
    sourceCollectionId: policy.sourceCollectionId,
    scanBatchId: policy.scanBatchId,
    sourceIdentity,
    code,
    candidates,
    exclusions
  });

  return Object.freeze({
    version: 1,
    workspaceId: policy.workspaceId,
    sourceCollectionId: policy.sourceCollectionId,
    scanBatchId: policy.scanBatchId,
    importBatchId: policy.importBatchId,
    stagingBatchId: policy.stagingBatchId,
    sourceIdentity,
    destinationIdentity: Object.freeze(destinationIdentity),
    code,
    candidates,
    exclusions,
    canonicalCandidateMaterial,
    candidateSetHash: sha256(canonicalCandidateMaterial)
  });
}

function inspectSourceAuthority(
  dependencies: CentralFloridaIcePreviewDependencies,
  policy: PreviewPolicy
): {
  rootRealpath: string;
  rootMetadata: PreviewPathMetadata;
  mount: PreviewMountRecord;
} {
  const rootRealpath = dependencies.filesystem.realpath(policy.sourceRoot);
  if (rootRealpath !== policy.sourceRoot) {
    fail("SOURCE_REALPATH_MISMATCH", "Selected source root does not resolve to approved authority");
  }

  const rootMetadata = snapshotPathMetadata(
    dependencies.filesystem.lstat(policy.sourceRoot),
    "SOURCE_ROOT_INVALID",
    "Selected source root metadata is not immutable plain data"
  );
  if (rootMetadata.kind !== "directory") {
    fail("SOURCE_ROOT_INVALID", "Selected source root is not a directory");
  }

  const mount = snapshotMountRecord(
    dependencies.mounts.inspect(policy.sourceRoot),
    "SOURCE_MOUNT_MISMATCH",
    "Selected source mount record is not immutable plain data"
  );
  if (mount.source !== policy.sourceDevice) {
    fail("SOURCE_DEVICE_MISMATCH", "Selected source is not on the approved device");
  }
  if (mount.target !== policy.sourceMount) {
    fail("SOURCE_MOUNT_MISMATCH", "Selected source is not on the approved mount target");
  }
  if (mount.fileSystem.toLowerCase() !== policy.sourceFileSystem.toLowerCase()) {
    fail("SOURCE_FILESYSTEM_MISMATCH", "Selected source filesystem does not match approved authority");
  }

  const optionSet = new Set(mount.options);
  if (policy.requiredSourceMountOptions.some((option) => !optionSet.has(option))) {
    fail(
      "SOURCE_MOUNT_OPTIONS_MISMATCH",
      "Selected source mount is missing a required safety option"
    );
  }
  if (!optionSet.has("ro") || optionSet.has("rw")) {
    fail("SOURCE_MOUNT_WRITABLE", "Selected source mount is not unambiguously read-only");
  }
  if (rootMetadata.deviceId !== mount.deviceId) {
    fail("SOURCE_DEVICE_MISMATCH", "Selected source directory device identity does not match mount");
  }

  return { rootRealpath, rootMetadata, mount };
}

function inspectDestinationAuthority(
  dependencies: CentralFloridaIcePreviewDependencies,
  policy: PreviewPolicy,
  sourceMountRecord: PreviewMountRecord,
  destinationMode: "empty-destination" | "mounted-preview"
): PreviewDestinationIdentity {
  if (isPathWithin(policy.destinationRoot, policy.sourceMount)) {
    fail("DESTINATION_ON_SOURCE_MOUNT", "Preview destination is within the source mount");
  }

  const initiallyPresent = dependencies.filesystem.exists(policy.destinationRoot);
  if (destinationMode === "mounted-preview" && !initiallyPresent) {
    fail("DESTINATION_INVALID", "Canonical preview destination is missing during resume");
  }
  if (initiallyPresent) {
    const destinationMetadata = snapshotPathMetadata(
      dependencies.filesystem.lstat(policy.destinationRoot),
      "DESTINATION_INVALID",
      "Preview destination metadata is not immutable plain data"
    );
    if (destinationMetadata.kind !== "directory") {
      fail("DESTINATION_COLLISION", "Preview destination collides with non-directory content");
    }
    if (
      destinationMode === "empty-destination"
      && dependencies.filesystem.readDirectory(policy.destinationRoot).length !== 0
    ) {
      fail("DESTINATION_COLLISION", "Preview destination contains pre-existing non-preview content");
    }
  }

  const nearestExistingParent = initiallyPresent
    ? policy.destinationRoot
    : findNearestExistingParent(dependencies.filesystem, policy.destinationRoot);
  const parentRealpath = dependencies.filesystem.realpath(nearestExistingParent);
  const resolvedDestination = initiallyPresent
    ? parentRealpath
    : resolve(parentRealpath, relative(nearestExistingParent, policy.destinationRoot));

  if (
    resolvedDestination !== policy.destinationRoot
    || isPathWithin(resolvedDestination, policy.sourceMount)
  ) {
    fail("DESTINATION_INVALID", "Preview destination does not resolve to approved internal path");
  }

  const parentMetadata = snapshotPathMetadata(
    dependencies.filesystem.lstat(nearestExistingParent),
    "DESTINATION_INVALID",
    "Preview destination parent metadata is not immutable plain data"
  );
  if (parentMetadata.kind !== "directory") {
    fail("DESTINATION_INVALID", "Preview destination parent is not a directory");
  }
  const destinationMount = snapshotMountRecord(
    dependencies.mounts.inspect(nearestExistingParent),
    "DESTINATION_INVALID",
    "Preview destination mount record is not immutable plain data"
  );
  const destinationOptions = new Set(destinationMount.options);

  if (
    destinationMount.target === sourceMountRecord.target
    || destinationMount.source === policy.sourceDevice
    || destinationMount.source === sourceMountRecord.source
    || destinationMount.deviceId === sourceMountRecord.deviceId
    || parentMetadata.deviceId === sourceMountRecord.deviceId
  ) {
    fail("DESTINATION_DEVICE_MISMATCH", "Preview destination is not isolated from source device");
  }
  if (parentMetadata.deviceId !== destinationMount.deviceId) {
    fail("DESTINATION_DEVICE_MISMATCH", "Preview destination parent identity does not match mount");
  }
  if (destinationOptions.has("ro") || !destinationOptions.has("rw")) {
    fail("DESTINATION_NOT_WRITABLE", "Preview destination filesystem is not unambiguously writable");
  }

  return {
    destinationPath: policy.destinationRoot,
    nearestExistingParent,
    mountTarget: destinationMount.target,
    mountSource: destinationMount.source,
    fileSystem: destinationMount.fileSystem,
    mountOptions: Object.freeze(sortStrings(destinationMount.options)),
    mountDeviceId: destinationMount.deviceId,
    parentDeviceId: parentMetadata.deviceId,
    initiallyPresent
  };
}

function inventorySourceTree(
  dependencies: CentralFloridaIcePreviewDependencies,
  policy: PreviewPolicy,
  approvedMount: PreviewMountRecord
): InventoriedFile[] {
  const files: InventoriedFile[] = [];

  function visitDirectory(absoluteDirectory: string, relativeDirectory: string): void {
    assertOnApprovedMount(dependencies, absoluteDirectory, approvedMount, policy);
    const entries = dependencies.filesystem.readDirectory(absoluteDirectory);
    const normalizedNames = new Set<string>();

    for (const entry of entries) {
      assertSafeEntryName(entry, normalizedNames);
    }

    for (const entry of sortStrings(entries)) {
      const absolutePath = resolve(absoluteDirectory, entry);
      const sourcePath = relativeDirectory === "" ? entry : `${relativeDirectory}/${entry}`;
      assertContainedSourcePath(policy.sourceRoot, absolutePath, sourcePath);

      const forbiddenClassification = classifyForbiddenName(entry);
      if (forbiddenClassification !== undefined) {
        fail(
          "FORBIDDEN_MATERIAL",
          `Forbidden source material detected by metadata classification: ${forbiddenClassification}`
        );
      }
      if (entry.toLowerCase().endsWith(".zip")) {
        fail("ARCHIVE_CONTAINER_FORBIDDEN", "Archive containers are outside approved source selection");
      }

      const metadata = snapshotPathMetadata(
        dependencies.filesystem.lstat(absolutePath),
        "UNSAFE_FILE_TYPE",
        "Source path metadata is not immutable plain data"
      );
      if (metadata.kind === "symlink" || metadata.kind === "other") {
        fail("UNSAFE_FILE_TYPE", "Source tree contains a symlink or special file");
      }
      assertOnApprovedMount(dependencies, absolutePath, approvedMount, policy, metadata);

      if (metadata.kind === "directory") {
        visitDirectory(absolutePath, sourcePath);
      } else if (metadata.kind === "file") {
        files.push({ absolutePath, sourcePath, metadata });
      } else {
        fail("UNSAFE_FILE_TYPE", "Source tree contains an unsupported path type");
      }
    }
  }

  visitDirectory(policy.sourceRoot, "");
  return files.sort((left, right) => compareCodeUnits(left.sourcePath, right.sourcePath));
}

function hashInventoriedFiles(
  dependencies: CentralFloridaIcePreviewDependencies,
  policy: PreviewPolicy,
  approvedMount: PreviewMountRecord,
  files: readonly InventoriedFile[]
): readonly PreviewRawImportCandidate[] {
  const seenContent = new Set<string>();
  const candidates: PreviewRawImportCandidate[] = [];

  for (const file of files) {
    const before = snapshotPathMetadata(
      dependencies.filesystem.lstat(file.absolutePath),
      "SOURCE_CHANGED_DURING_HASH",
      "Source file metadata changed to unsupported boundary data"
    );
    assertSameMetadata(file.metadata, before);
    assertOnApprovedMount(dependencies, file.absolutePath, approvedMount, policy, before);

    const bytes = dependencies.filesystem.readFile(file.absolutePath);
    const after = snapshotPathMetadata(
      dependencies.filesystem.lstat(file.absolutePath),
      "SOURCE_CHANGED_DURING_HASH",
      "Source file metadata changed to unsupported boundary data"
    );
    assertSameMetadata(file.metadata, after);
    assertOnApprovedMount(dependencies, file.absolutePath, approvedMount, policy, after);

    if (bytes.byteLength !== file.metadata.sizeBytes) {
      fail("SOURCE_CHANGED_DURING_HASH", "Source file changed during deterministic hash pass");
    }

    const contentHash = `sha256:${createHash("sha256").update(bytes).digest("hex")}` as const;
    const scanStatus: PreviewScanStatus = seenContent.has(contentHash) ? "duplicate" : "new";
    seenContent.add(contentHash);

    candidates.push(Object.freeze({
      occurrenceId: stableLocalFilesystemOccurrenceId({
        kind: "file",
        sourceCollectionId: policy.sourceCollectionId,
        scanBatchId: policy.scanBatchId,
        sourcePath: file.sourcePath,
        contentHash
      }),
      sourcePath: file.sourcePath,
      contentHash,
      mediaType: mediaTypeForPath(file.sourcePath),
      sizeBytes: file.metadata.sizeBytes,
      deviceId: file.metadata.deviceId,
      inode: file.metadata.inode,
      scanStatus,
      preservationStatus: preservationStatusForPath(file.sourcePath),
      sourceCollectionId: policy.sourceCollectionId,
      scanBatchId: policy.scanBatchId
    }));
  }

  return Object.freeze(candidates);
}

function snapshotInspectionInput(
  input: CentralFloridaIcePreviewInspectionInput
): Readonly<{ codeSha: string }> {
  if (typeof input !== "object" || input === null || Object.getPrototypeOf(input) !== Object.prototype) {
    fail("CODE_SHA_INVALID", "Preview inspection input must be a plain own-data object");
  }

  const ownKeys = Reflect.ownKeys(input);
  if (ownKeys.length !== 1 || ownKeys[0] !== "codeSha") {
    fail("CODE_SHA_INVALID", "Preview inspection input contains unexpected fields");
  }

  const descriptor = Object.getOwnPropertyDescriptor(input, "codeSha");
  if (
    descriptor === undefined
    || !Object.hasOwn(descriptor, "value")
    || typeof descriptor.value !== "string"
  ) {
    fail("CODE_SHA_INVALID", "Preview code SHA must be an own data property");
  }

  return Object.freeze({ codeSha: descriptor.value });
}

function snapshotMountRecord(
  value: PreviewMountRecord,
  code: PreviewPreflightErrorCode,
  message: string
): PreviewMountRecord {
  if (typeof value !== "object" || value === null || Object.getPrototypeOf(value) !== Object.prototype) {
    fail(code, message);
  }

  const expectedKeys = ["target", "source", "fileSystem", "options", "deviceId"] as const;
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.length !== expectedKeys.length
    || ownKeys.some((key) => typeof key !== "string" || !expectedKeys.includes(key as typeof expectedKeys[number]))
  ) {
    fail(code, message);
  }

  const descriptors = Object.getOwnPropertyDescriptors(value);
  const target = mountStringValue(descriptors.target, code, message);
  const source = mountStringValue(descriptors.source, code, message);
  const fileSystem = mountStringValue(descriptors.fileSystem, code, message);
  const deviceId = mountStringValue(descriptors.deviceId, code, message);
  const optionsDescriptor = descriptors.options;
  if (optionsDescriptor === undefined || !Object.hasOwn(optionsDescriptor, "value")) {
    fail(code, message);
  }
  const options = snapshotMountOptions(optionsDescriptor.value, code, message);

  return Object.freeze({
    target,
    source,
    fileSystem,
    options,
    deviceId
  });
}

function mountStringValue(
  descriptor: PropertyDescriptor | undefined,
  code: PreviewPreflightErrorCode,
  message: string
): string {
  if (
    descriptor === undefined
    || !Object.hasOwn(descriptor, "value")
    || typeof descriptor.value !== "string"
    || descriptor.value.length === 0
    || descriptor.value.trim() !== descriptor.value
    || /[\u0000-\u001f\u007f]/.test(descriptor.value)
  ) {
    fail(code, message);
  }

  return descriptor.value;
}

function snapshotMountOptions(
  value: unknown,
  code: PreviewPreflightErrorCode,
  message: string
): readonly string[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    fail(code, message);
  }

  const descriptors = Object.getOwnPropertyDescriptors(value);
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (
    lengthDescriptor === undefined
    || !Object.hasOwn(lengthDescriptor, "value")
    || !Number.isSafeInteger(lengthDescriptor.value)
    || lengthDescriptor.value < 0
  ) {
    fail(code, message);
  }

  const length = lengthDescriptor.value as number;
  const expectedKeys = new Set<string>(["length"]);
  const options: string[] = [];
  for (let index = 0; index < length; index += 1) {
    const key = String(index);
    expectedKeys.add(key);
    const descriptor = descriptors[key];
    const option = mountStringValue(descriptor, code, message);
    options.push(option);
  }

  if (
    Reflect.ownKeys(value).some((key) => typeof key !== "string" || !expectedKeys.has(key))
    || new Set(options).size !== options.length
  ) {
    fail(code, message);
  }

  return Object.freeze(sortStrings(options));
}

function snapshotPathMetadata(
  value: PreviewPathMetadata,
  code: PreviewPreflightErrorCode,
  message: string
): PreviewPathMetadata {
  if (typeof value !== "object" || value === null || Object.getPrototypeOf(value) !== Object.prototype) {
    fail(code, message);
  }

  const expectedKeys = ["kind", "deviceId", "sizeBytes", "inode"] as const;
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.length !== expectedKeys.length
    || ownKeys.some((key) => typeof key !== "string" || !expectedKeys.includes(key as typeof expectedKeys[number]))
  ) {
    fail(code, message);
  }

  const descriptors = Object.getOwnPropertyDescriptors(value);
  const kindDescriptor = descriptors.kind;
  if (
    kindDescriptor === undefined
    || !Object.hasOwn(kindDescriptor, "value")
    || !new Set<PreviewPathKind>(["directory", "file", "symlink", "other"]).has(
      kindDescriptor.value as PreviewPathKind
    )
  ) {
    fail(code, message);
  }
  const deviceId = mountStringValue(descriptors.deviceId, code, message);
  const inode = mountStringValue(descriptors.inode, code, message);
  const sizeDescriptor = descriptors.sizeBytes as PropertyDescriptor | undefined;
  if (
    sizeDescriptor === undefined
    || !Object.hasOwn(sizeDescriptor, "value")
    || !Number.isSafeInteger(sizeDescriptor.value)
    || sizeDescriptor.value < 0
  ) {
    fail(code, message);
  }

  return Object.freeze({
    kind: kindDescriptor.value as PreviewPathKind,
    deviceId,
    sizeBytes: sizeDescriptor.value as number,
    inode
  });
}

function validatePolicy(policy: PreviewPolicy): void {
  if (
    !isAbsolute(policy.sourceRoot)
    || !isAbsolute(policy.sourceMount)
    || !isAbsolute(policy.destinationRoot)
    || !isPathWithin(policy.sourceRoot, policy.sourceMount)
    || policy.expectedFileCount < 1
    || !Number.isSafeInteger(policy.expectedFileCount)
  ) {
    fail("POLICY_INVALID", "Preview policy contains an invalid path or file count");
  }
}

function validateCodeSha(codeSha: string): void {
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(codeSha)) {
    fail("CODE_SHA_INVALID", "Preview code SHA must be a full lowercase Git object identifier");
  }
}

function findNearestExistingParent(filesystem: PreviewFilesystemPort, path: string): string {
  let candidate = dirname(path);

  while (!filesystem.exists(candidate)) {
    const parent = dirname(candidate);
    if (parent === candidate) {
      fail("DESTINATION_INVALID", "Preview destination has no resolvable existing parent");
    }
    candidate = parent;
  }

  return candidate;
}

function assertSafeEntryName(entry: string, normalizedNames: Set<string>): void {
  const normalized = entry.normalize("NFC");
  const ambiguityKey = normalized.toLowerCase();

  if (
    entry.length === 0
    || entry === "."
    || entry === ".."
    || entry !== normalized
    || entry.trim() !== entry
    || entry.includes("/")
    || entry.includes("\\")
    || entry.includes("\0")
    || /[\u0000-\u001f\u007f]/.test(entry)
    || normalizedNames.has(ambiguityKey)
  ) {
    fail("AMBIGUOUS_SOURCE_PATH", "Source tree contains an ambiguous path entry");
  }

  normalizedNames.add(ambiguityKey);
}

function assertContainedSourcePath(
  root: string,
  absolutePath: string,
  sourcePath: string
): void {
  if (
    sourcePath.startsWith("../")
    || sourcePath === ".."
    || sourcePath.includes(`..${sep}`)
    || !isPathWithin(absolutePath, root)
  ) {
    fail("AMBIGUOUS_SOURCE_PATH", "Source path escapes approved source root");
  }
}

function assertOnApprovedMount(
  dependencies: CentralFloridaIcePreviewDependencies,
  path: string,
  approvedMount: PreviewMountRecord,
  policy: PreviewPolicy,
  metadataInput?: PreviewPathMetadata
): void {
  const metadata = snapshotPathMetadata(
    metadataInput ?? dependencies.filesystem.lstat(path),
    "SOURCE_MOUNT_CROSSING",
    "Source path metadata changed to unsupported boundary data"
  );
  const mount = snapshotMountRecord(
    dependencies.mounts.inspect(path),
    "SOURCE_MOUNT_CROSSING",
    "Source mount record changed to unsupported boundary data"
  );
  if (
    mount.target !== policy.sourceMount
    || mount.source !== policy.sourceDevice
    || mount.fileSystem.toLowerCase() !== policy.sourceFileSystem.toLowerCase()
    || mount.target !== approvedMount.target
    || mount.source !== approvedMount.source
    || mount.fileSystem.toLowerCase() !== approvedMount.fileSystem.toLowerCase()
    || mount.deviceId !== approvedMount.deviceId
    || metadata.deviceId !== approvedMount.deviceId
  ) {
    fail("SOURCE_MOUNT_CROSSING", "Source tree crosses the approved mount boundary");
  }

  const optionSet = new Set(mount.options);
  if (!optionSet.has("ro") || optionSet.has("rw")) {
    fail("SOURCE_MOUNT_WRITABLE", "Source mount posture changed before content inspection");
  }
  if (policy.requiredSourceMountOptions.some((option) => !optionSet.has(option))) {
    fail(
      "SOURCE_MOUNT_OPTIONS_MISMATCH",
      "Source mount safety options changed before content inspection"
    );
  }
  if (!arraysEqual(mount.options, approvedMount.options)) {
    fail(
      "SOURCE_MOUNT_OPTIONS_MISMATCH",
      "Source mount options changed after initial authority validation"
    );
  }
}

function assertSameMetadata(expected: PreviewPathMetadata, actual: PreviewPathMetadata): void {
  if (
    actual.kind !== "file"
    || actual.kind !== expected.kind
    || actual.deviceId !== expected.deviceId
    || actual.sizeBytes !== expected.sizeBytes
    || actual.inode !== expected.inode
  ) {
    fail("SOURCE_CHANGED_DURING_HASH", "Source file identity changed during hash pass");
  }
}

function classifyForbiddenName(entry: string): string | undefined {
  const lower = entry.toLowerCase();
  const withoutBackupSuffix = lower.replace(/(?:\.(?:bak|backup|old|orig|save)|~)+$/, "");
  const credentialStemWithPossibleBackup = withoutBackupSuffix.replace(
    /\.(?:txt|json|ya?ml|toml|ini|conf|config|env|properties|xml)$/,
    ""
  );
  const credentialStem = credentialStemWithPossibleBackup.replace(
    /[._-](?:bak|backup|old|orig|save)$/,
    ""
  );
  const credentialStemWithoutLeadingDot = credentialStem.replace(/^\./, "");

  if (/^\.env(?:[._-].*)?$/.test(lower)) {
    return "environment-secret";
  }
  if (lower === ".git") {
    return "git-material";
  }
  if (
    new Set([
      ".cache",
      ".pytest_cache",
      ".mypy_cache",
      ".ruff_cache",
      ".hypothesis",
      ".tox",
      ".nox",
      ".ipynb_checkpoints",
      ".gradle",
      ".cargo",
      ".npm",
      ".yarn",
      ".pnpm-store",
      ".parcel-cache",
      ".turbo",
      ".vite",
      "cache",
      "caches",
      "__pycache__",
      ".venv",
      "venv",
      "virtualenv",
      "node_modules",
      "dependencies",
      "vendor",
      "build",
      "dist",
      "out",
      "output",
      "coverage",
      "generated",
      "target",
      ".coverage",
      "htmlcov",
      ".next",
      ".worktrees",
      "workspaces",
      "other-workspaces"
    ]).has(lower)
  ) {
    return "excluded-tree";
  }
  if (
    lower === ".ssh"
    || lower === ".aws"
    || lower === ".gnupg"
    || lower === ".docker"
    || lower === ".kube"
    || withoutBackupSuffix === ".npmrc"
    || withoutBackupSuffix === ".pypirc"
    || withoutBackupSuffix === ".netrc"
    || /^(?:[a-z0-9]+[._-])*(?:credentials?|secrets?|tokens?|auth(?:entication)?|api[._-]?key|access[._-]?token|refresh[._-]?token)$/.test(credentialStemWithoutLeadingDot)
    || /^(?:[a-z0-9]+[._-])*(?:private[._-]?key|id[._-]?(?:rsa|ed25519))$/.test(credentialStemWithoutLeadingDot)
    || withoutBackupSuffix.endsWith(".key")
    || withoutBackupSuffix.endsWith(".pem")
    || /\.(?:p12|pfx|jks|keystore|kdbx)$/.test(withoutBackupSuffix)
  ) {
    return "credential-material";
  }

  return undefined;
}

function preservationStatusForPath(sourcePath: string): PreviewPreservationStatus {
  const components = sourcePath.toLowerCase().split("/");
  const basename = components.at(-1) ?? "";

  if (
    components.some((component) => component === "superseded")
    || /(?:^|[._-])superseded(?:[._-]|$)/.test(basename)
  ) {
    return "superseded";
  }
  if (
    components.some((component) => component === "archive" || component === "archived")
    || /(?:^|[._-])archived?(?:[._-]|$)/.test(basename)
  ) {
    return "archived";
  }

  return "current";
}

function mediaTypeForPath(path: string): string {
  const lower = path.toLowerCase();

  if (lower.endsWith(".json")) {
    return "application/json";
  }
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) {
    return "text/markdown";
  }
  if (lower.endsWith(".yaml") || lower.endsWith(".yml")) {
    return "application/yaml";
  }
  if (lower.endsWith(".csv")) {
    return "text/csv";
  }
  if (lower.endsWith(".txt")) {
    return "text/plain";
  }

  return "application/octet-stream";
}

function sortStrings(values: readonly string[]): string[] {
  return [...values].sort(compareCodeUnits);
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isPathWithin(path: string, root: string): boolean {
  const normalizedPath = resolve(path);
  const normalizedRoot = resolve(root);
  const relativePath = relative(normalizedRoot, normalizedPath);
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

function fail(code: PreviewPreflightErrorCode, message: string): never {
  throw new PreviewPreflightError(code, message);
}

export type CentralFloridaIcePreviewCommand =
  | "inspect"
  | "raw-import"
  | "staging-preview"
  | "stage"
  | "handoff"
  | "verify-replay"
  | "manifest";

export type CentralFloridaIcePreviewPhase =
  | "inspection-blocked"
  | "raw-approval-required"
  | "staging-preview-required"
  | "staging-approval-required"
  | "handoff-required"
  | "replay-verification-required"
  | "manifest-required"
  | "complete";

export interface CentralFloridaIcePreviewBlocker {
  readonly code: string;
  readonly message: string;
  readonly resumable: boolean;
  readonly allowedNextCommand: CentralFloridaIcePreviewCommand;
}

export interface CentralFloridaIcePreviewDurableState {
  readonly codeSha: string;
  readonly candidateSetHash?: `sha256:${string}`;
  readonly sourceIdentityHash?: `sha256:${string}`;
  readonly destinationIdentityHash?: `sha256:${string}`;
  readonly candidateArtifactHash?: `sha256:${string}`;
  readonly inspectionArtifactHash?: `sha256:${string}`;
  readonly legacyReportId?: string;
  readonly reportHash?: `sha256:${string}`;
  readonly legacyCandidateSetHash?: `sha256:${string}`;
  readonly quarantineArtifactHash?: `sha256:${string}`;
  readonly dossierArtifactHash?: `sha256:${string}`;
  readonly stagingPreviewArtifactHash?: `sha256:${string}`;
  readonly stagingCandidateIds?: readonly string[];
  readonly proposedAssertionIds?: readonly string[];
  readonly handoffArtifactHash?: `sha256:${string}`;
  readonly replayArtifactHash?: `sha256:${string}`;
  readonly finalManifestArtifactHash?: `sha256:${string}`;
  readonly eventIds: readonly string[];
  readonly artifactHashes: readonly `sha256:${string}`[];
  readonly commands: readonly CentralFloridaIcePreviewCommand[];
  readonly counts: Readonly<Record<string, number>>;
  readonly blockers: readonly CentralFloridaIcePreviewBlocker[];
}

export interface CentralFloridaIcePreviewCheckpoint {
  readonly schemaVersion: "central-fl-ice-preview-checkpoint.v1";
  readonly sequence: number;
  readonly phase: CentralFloridaIcePreviewPhase;
  readonly command: CentralFloridaIcePreviewCommand;
  readonly createdAt: string;
  readonly previousStateHash: `sha256:${string}` | null;
  readonly allowedNextCommand: CentralFloridaIcePreviewCommand | null;
  readonly state: CentralFloridaIcePreviewDurableState;
  readonly stateHash: `sha256:${string}`;
}

export type CentralFloridaIcePreviewCheckpointDraft = Omit<
  CentralFloridaIcePreviewCheckpoint,
  "schemaVersion" | "sequence" | "previousStateHash" | "stateHash"
>;

export interface CentralFloridaIcePreviewCheckpointStore {
  readAll(): readonly CentralFloridaIcePreviewCheckpoint[];
  append(
    draft: CentralFloridaIcePreviewCheckpointDraft
  ): CentralFloridaIcePreviewCheckpoint;
}

export interface CentralFloridaIcePreviewWorkspaceSnapshot {
  readonly events: readonly KnowledgeEvent[];
  readonly occurrences: readonly {
    readonly occurrenceId: string;
    readonly sourceCollectionId: string;
    readonly scanBatchId: string;
    readonly sourcePath: string;
    readonly contentHash: `sha256:${string}`;
  }[];
  readonly evidenceLinks: readonly {
    readonly eventId: string;
    readonly evidenceId: string;
    readonly importBatchId: string;
    readonly sourceCollectionId: string;
    readonly contentHash: `sha256:${string}`;
    readonly occurrenceIds: readonly string[];
  }[];
}

export interface CentralFloridaIcePreviewWorkflowDependencies {
  readonly codeSha?: (() => string) | undefined;
  readonly now?: (() => string) | undefined;
  readonly initialInspection?: (() => CentralFloridaIceCandidateInspection) | undefined;
  readonly resumeInspection?: (() => CentralFloridaIceCandidateInspection) | undefined;
  readonly createWorkspace?: (() => void) | undefined;
  readonly mountResolver?: IngestionWorkspaceMountResolver | undefined;
  readonly legacyRuntimeFactory?: ((
    workspace: MountedWorkspace
  ) => LegacyImportRuntime) | undefined;
  readonly readWorkspaceSnapshot?: ((
    workspace: MountedWorkspace
  ) => Promise<CentralFloridaIcePreviewWorkspaceSnapshot>) | undefined;
  readonly checkpointStore?: CentralFloridaIcePreviewCheckpointStore | undefined;
}

export interface CentralFloridaIcePreviewWorkflow {
  inspect(): Promise<CentralFloridaIcePreviewCheckpoint>;
  rawImport(input: { readonly approvedBy: string }): Promise<CentralFloridaIcePreviewCheckpoint>;
  stagingPreview(): Promise<CentralFloridaIcePreviewCheckpoint>;
  stage(input: {
    readonly approvedBy: string;
    readonly candidateIds: readonly string[];
  }): Promise<CentralFloridaIcePreviewCheckpoint>;
  handoff(): Promise<CentralFloridaIcePreviewCheckpoint>;
  verifyReplay(): Promise<CentralFloridaIcePreviewCheckpoint>;
  manifest(): Promise<CentralFloridaIcePreviewCheckpoint>;
  status(): readonly CentralFloridaIcePreviewCheckpoint[];
}

/**
 * Composes the existing portable workspace, legacy runtime, bootstrap dossier,
 * and rebuildable projections behind a development-only supervised state
 * machine. Omitting a specialist gateway is intentionally fail-closed: the
 * deterministic local handoff is persisted with a resumable authority blocker.
 */
export function createCentralFloridaIcePreviewWorkflow(
  overrides: CentralFloridaIcePreviewWorkflowDependencies = {}
): CentralFloridaIcePreviewWorkflow {
  const codeSha = overrides.codeSha ?? readCurrentGitSha;
  const now = overrides.now ?? (() => new Date().toISOString());
  const filesystem = createNodePreviewFilesystemPort();
  const mounts = createFindmntPreviewMountInspectionPort();
  const initialInspection = overrides.initialInspection ?? (() =>
    inspectCentralFloridaIceCandidates({ filesystem, mounts }, { codeSha: codeSha() }));
  const resumeInspection = overrides.resumeInspection ?? (() =>
    revalidateCentralFloridaIceCandidates({ filesystem, mounts }, { codeSha: codeSha() }));
  const createWorkspace = overrides.createWorkspace ?? (() => {
    createPortableWorkspace({
      rootDir: CENTRAL_FL_ICE_PREVIEW.destinationRoot,
      workspaceId: CENTRAL_FL_ICE_PREVIEW.workspaceId,
      label: "Central Florida ICE engineering preview",
      createdBy: "actor_central_fl_ice_preview",
      description: "Independent supervised evidence-first legacy engineering preview."
    });
  });
  const mountResolver = overrides.mountResolver ?? createPortableIngestionMountResolver();
  const legacyRuntimeFactory = overrides.legacyRuntimeFactory ?? ((workspace) =>
    createLegacyImportRuntime({
      mountedWorkspace: workspace,
      actor: {
        id: "actor_central_fl_ice_preview",
        kind: "agent",
        label: "Central Florida ICE preview"
      }
    }));
  const readWorkspaceSnapshot = overrides.readWorkspaceSnapshot ?? readPreviewWorkspaceSnapshot;
  const checkpointStore = overrides.checkpointStore
    ?? createFileCentralFloridaIcePreviewCheckpointStore(CENTRAL_FL_ICE_PREVIEW.destinationRoot);

  async function inspect(): Promise<CentralFloridaIcePreviewCheckpoint> {
    const checkpoints = checkpointStore.readAll();
    const latest = checkpoints.at(-1);
    if (latest !== undefined && latest.phase !== "inspection-blocked") {
      transitionFailure("inspect", latest);
    }

    const inspection = latest === undefined ? initialInspection() : resumeInspection();
    if (latest !== undefined) {
      assertInspectionMatchesCheckpoint(inspection, latest);
    } else {
      createWorkspace();
    }

    try {
      return await withPreviewWorkspace(mountResolver, async (workspace) => {
        const runtime = legacyRuntimeFactory(workspace);
        const before = await readWorkspaceSnapshot(workspace);
        const inspected = await runtime.inspect({
          sourceCollectionId: CENTRAL_FL_ICE_PREVIEW.sourceCollectionId,
          label: "Central Florida ICE legacy investigation",
          sourceRoot: CENTRAL_FL_ICE_PREVIEW.sourceRoot,
          scanBatchId: CENTRAL_FL_ICE_PREVIEW.scanBatchId,
          selectedFiles: inspection.candidates.map((candidate) => ({
            occurrenceId: candidate.occurrenceId,
            sourcePath: candidate.sourcePath,
            contentHash: candidate.contentHash,
            sizeBytes: candidate.sizeBytes,
            deviceId: candidate.deviceId,
            inode: candidate.inode
          })),
          revalidateAuthority: () => {
            assertInspectionsMatch(inspection, resumeInspection());
          }
        });
        const inspectResult = requireLegacySuccess(inspected, "legacy inspect");
        const reportResult = requireLegacySuccess(
          await runtime.report({
            sourceCollectionId: CENTRAL_FL_ICE_PREVIEW.sourceCollectionId,
            legacyReportId: inspectResult.legacyReportId
          }),
          "legacy report"
        );
        const quarantineResult = requireLegacySuccess(
          await runtime.quarantine({
            sourceCollectionId: CENTRAL_FL_ICE_PREVIEW.sourceCollectionId,
            legacyReportId: inspectResult.legacyReportId
          }),
          "legacy quarantine"
        );
        assertInspectionsMatch(inspection, resumeInspection());
        assertReportMatchesInspection(reportResult.report, inspection);

        assertInspectionsMatch(inspection, resumeInspection());
        const candidateArtifact = await workspace.derivativeStore.put(
          Buffer.from(inspection.canonicalCandidateMaterial, "utf8")
        );
        if (candidateArtifact.contentHash !== inspection.candidateSetHash) {
          throw new Error("raw candidate artifact hash does not match deterministic candidate set");
        }
        assertInspectionsMatch(inspection, resumeInspection());
        const inspectionArtifact = await putStableArtifact(workspace, inspection);
        assertInspectionsMatch(inspection, resumeInspection());
        const quarantineArtifact = await putStableArtifact(workspace, {
          legacyReportId: quarantineResult.legacyReportId,
          reportHash: quarantineResult.reportHash,
          quarantineEntries: quarantineResult.quarantineEntries
        });
        const after = await readWorkspaceSnapshot(workspace);
        assertOnlyAllowedNewEvents(before.events, after.events, new Set([
          "ingestion.source.registered",
          "ingestion.scan.started",
          "ingestion.occurrence.observed",
          "ingestion.scan.completed",
          "legacy.import.report.generated",
          "diagnostic.recorded"
        ]));
        assertInspectionsMatch(inspection, resumeInspection());

        return checkpointStore.append({
          phase: "raw-approval-required",
          command: "inspect",
          createdAt: now(),
          allowedNextCommand: "raw-import",
          state: stablePreviewState({
            codeSha: inspection.code.codeSha,
            candidateSetHash: inspection.candidateSetHash,
            sourceIdentityHash: sha256(stableJson(inspection.sourceIdentity)),
            destinationIdentityHash: sha256(stableJson(
              stableDestinationAuthority(inspection.destinationIdentity)
            )),
            candidateArtifactHash: candidateArtifact.contentHash,
            inspectionArtifactHash: inspectionArtifact.contentHash,
            legacyReportId: reportResult.legacyReportId,
            reportHash: reportResult.reportHash,
            legacyCandidateSetHash: reportResult.candidateSetHash,
            quarantineArtifactHash: quarantineArtifact.contentHash,
            eventIds: newEventIds(before.events, after.events),
            artifactHashes: [
              candidateArtifact.contentHash,
              inspectionArtifact.contentHash,
              reportResult.reportHash,
              quarantineArtifact.contentHash
            ],
            commands: ["inspect"],
            counts: {
              candidates: inspection.candidates.length,
              bytes: inspection.sourceIdentity.totalBytes,
              duplicates: inspection.candidates.filter((item) => item.scanStatus === "duplicate").length,
              archived: inspection.candidates.filter((item) => item.preservationStatus === "archived").length,
              superseded: inspection.candidates.filter((item) => item.preservationStatus === "superseded").length,
              exclusions: inspection.exclusions.reduce((total, item) => total + item.count, 0),
              quarantine: quarantineResult.quarantineEntries.length
            },
            blockers: []
          })
        });
      });
    } catch (error) {
      const previous = checkpointStore.readAll().at(-1);
      if (previous?.phase === "inspection-blocked") {
        throw error;
      }
      try {
        assertInspectionsMatch(inspection, resumeInspection());
      } catch {
        throw error;
      }
      const blocked = checkpointStore.append({
        phase: "inspection-blocked",
        command: "inspect",
        createdAt: now(),
        allowedNextCommand: "inspect",
        state: stablePreviewState({
          codeSha: inspection.code.codeSha,
          candidateSetHash: inspection.candidateSetHash,
          sourceIdentityHash: sha256(stableJson(inspection.sourceIdentity)),
          destinationIdentityHash: sha256(stableJson(
            stableDestinationAuthority(inspection.destinationIdentity)
          )),
          eventIds: [],
          artifactHashes: [],
          commands: ["inspect"],
          counts: { candidates: inspection.candidates.length },
          blockers: [{
            code: "inspection-runtime-blocked",
            message: "Inspection runtime did not reach the supervised raw-import gate.",
            resumable: true,
            allowedNextCommand: "inspect"
          }]
        })
      });
      throw new Error(`Central Florida ICE preview inspection blocked at ${blocked.stateHash}`, {
        cause: error
      });
    }
  }

  async function rawImport(input: {
    readonly approvedBy: string;
  }): Promise<CentralFloridaIcePreviewCheckpoint> {
    const latest = requireTransition(checkpointStore, "raw-import", "raw-approval-required");
    const approvedBy = humanIdentity(input.approvedBy);
    const inspection = resumeInspection();
    assertInspectionMatchesCheckpoint(inspection, latest);

    return withPreviewWorkspace(mountResolver, async (workspace) => {
      assertInspectionMatchesCheckpoint(resumeInspection(), latest);
      const runtime = legacyRuntimeFactory(workspace);
      const before = await readWorkspaceSnapshot(workspace);
      const approval = requireLegacySuccess(await runtime.approveRawImport({
        sourceCollectionId: CENTRAL_FL_ICE_PREVIEW.sourceCollectionId,
        scanBatchId: CENTRAL_FL_ICE_PREVIEW.scanBatchId,
        importBatchId: CENTRAL_FL_ICE_PREVIEW.importBatchId,
        approvedBy
      }), "legacy approve-import");
      assertInspectionMatchesCheckpoint(resumeInspection(), latest);
      const imported = requireLegacySuccess(await runtime.importApproved({
        sourceCollectionId: CENTRAL_FL_ICE_PREVIEW.sourceCollectionId,
        scanBatchId: CENTRAL_FL_ICE_PREVIEW.scanBatchId,
        importBatchId: CENTRAL_FL_ICE_PREVIEW.importBatchId,
        selectedFiles: inspection.candidates.map((candidate) => ({
          occurrenceId: candidate.occurrenceId,
          sourcePath: candidate.sourcePath,
          contentHash: candidate.contentHash,
          sizeBytes: candidate.sizeBytes,
          deviceId: candidate.deviceId,
          inode: candidate.inode
        }))
      }), "legacy import");
      assertInspectionsMatch(inspection, resumeInspection());
      const after = await readWorkspaceSnapshot(workspace);
      assertOnlyAllowedNewEvents(before.events, after.events, new Set([
        "ingestion.import.approved",
        "evidence.ingested",
        "ingestion.evidence.linked",
        "ingestion.import.completed",
        "ingestion.parse.job.created",
        "diagnostic.recorded"
      ]));
      assertEvidenceBindings(inspection.candidates, after);
      assertInspectionMatchesCheckpoint(resumeInspection(), latest);

      return checkpointStore.append({
        phase: "staging-preview-required",
        command: "raw-import",
        createdAt: now(),
        allowedNextCommand: "staging-preview",
        state: mergePreviewState(latest.state, {
          eventIds: [...latest.state.eventIds, ...approval.eventIds, ...imported.eventIds],
          commands: [...latest.state.commands, "raw-import"],
          counts: {
            ...latest.state.counts,
            evidenceCreated: imported.totals.evidenceCreated,
            occurrencesLinked: imported.totals.occurrencesLinked,
            duplicatesReused: imported.totals.duplicatesReused,
            skipped: imported.totals.skipped
          }
        })
      });
    });
  }

  async function stagingPreview(): Promise<CentralFloridaIcePreviewCheckpoint> {
    const latest = requireTransition(
      checkpointStore,
      "staging-preview",
      "staging-preview-required"
    );
    assertInspectionMatchesCheckpoint(resumeInspection(), latest);

    return withPreviewWorkspace(mountResolver, async (workspace) => {
      const runtime = legacyRuntimeFactory(workspace);
      const legacyReportId = requiredStateString(latest, "legacyReportId");
      const report = requireLegacySuccess(await runtime.report({
        sourceCollectionId: CENTRAL_FL_ICE_PREVIEW.sourceCollectionId,
        legacyReportId
      }), "legacy report");
      const preview = requireLegacySuccess(await runtime.stagingPreview({
        sourceCollectionId: CENTRAL_FL_ICE_PREVIEW.sourceCollectionId,
        legacyReportId
      }), "legacy staging-preview");
      assertReportCheckpointIdentity(report, latest);
      const snapshot = await readWorkspaceSnapshot(workspace);
      const evidenceLinks = dossierEvidenceLinks(snapshot);
      const legacyProjection = buildLegacyImportProjection(snapshot.events);
      const reportEventId = legacyProjection.reports.get(legacyReportId)?.reportEventId;
      if (typeof reportEventId !== "string" || reportEventId.length === 0) {
        throw new Error("legacy report event provenance is unavailable");
      }
      const dossier = buildOntologyBootstrapDossier({
        report: report.report,
        review: {
          ...report.review,
          rawImportRequiresApproval: false
        },
        evidenceLinks,
        now,
        provenanceRefs: [
          reportEventId,
          ...snapshot.evidenceLinks.map((link) => link.eventId)
        ]
      });
      const selectedCandidateIds = preview.candidates
        .map((candidate) => candidate.candidateId)
        .sort(compareCodeUnits);
      assertInspectionMatchesCheckpoint(resumeInspection(), latest);
      const stagingArtifact = await putStableArtifact(workspace, {
        schemaVersion: "central-fl-ice-staging-preview.v1",
        legacyReportId: preview.legacyReportId,
        reportHash: preview.reportHash,
        candidateSetHash: preview.candidateSetHash,
        selectedCandidateIds,
        candidates: preview.candidates,
        quarantineEntries: preview.quarantineEntries
      });
      assertInspectionMatchesCheckpoint(resumeInspection(), latest);
      const dossierArtifact = await putStableArtifact(workspace, dossier);
      assertInspectionMatchesCheckpoint(resumeInspection(), latest);

      return checkpointStore.append({
        phase: "staging-approval-required",
        command: "staging-preview",
        createdAt: now(),
        allowedNextCommand: "stage",
        state: mergePreviewState(latest.state, {
          dossierArtifactHash: dossierArtifact.contentHash,
          stagingPreviewArtifactHash: stagingArtifact.contentHash,
          stagingCandidateIds: selectedCandidateIds,
          artifactHashes: [
            ...latest.state.artifactHashes,
            dossierArtifact.contentHash,
            stagingArtifact.contentHash
          ],
          commands: [...latest.state.commands, "staging-preview"],
          counts: {
            ...latest.state.counts,
            stagingCandidates: selectedCandidateIds.length,
            blockedCandidates: dossier.summary.blockedAssertionCandidates
          }
        })
      });
    });
  }

  async function stage(input: {
    readonly approvedBy: string;
    readonly candidateIds: readonly string[];
  }): Promise<CentralFloridaIcePreviewCheckpoint> {
    const latest = requireTransition(checkpointStore, "stage", "staging-approval-required");
    const approvedBy = humanIdentity(input.approvedBy);
    const selectedCandidateIds = exactCandidateSelection(
      input.candidateIds,
      latest.state.stagingCandidateIds ?? []
    );
    assertInspectionMatchesCheckpoint(resumeInspection(), latest);

    return withPreviewWorkspace(mountResolver, async (workspace) => {
      const runtime = legacyRuntimeFactory(workspace);
      const legacyReportId = requiredStateString(latest, "legacyReportId");
      const report = requireLegacySuccess(await runtime.report({
        sourceCollectionId: CENTRAL_FL_ICE_PREVIEW.sourceCollectionId,
        legacyReportId
      }), "legacy report");
      const preview = requireLegacySuccess(await runtime.stagingPreview({
        sourceCollectionId: CENTRAL_FL_ICE_PREVIEW.sourceCollectionId,
        legacyReportId
      }), "legacy staging-preview");
      assertReportCheckpointIdentity(report, latest);
      assertStageSelectionBindings(report.report, preview, selectedCandidateIds);

      const evidenceRefs = preview.candidates
        .filter((candidate) => selectedCandidateIds.includes(candidate.candidateId))
        .map((candidate) => ({
          candidateId: candidate.candidateId,
          evidenceId: candidate.evidenceId,
          evidenceContentHash: candidate.evidenceContentHash
        }));
      const approvalPreview = createStagingApprovalPreview({
        report: report.report,
        stagingBatchId: CENTRAL_FL_ICE_PREVIEW.stagingBatchId,
        selectedCandidateIds,
        evidenceRefs
      });
      const executionPreview = createStagingExecutionPreview({
        report: report.report,
        stagingBatchId: CENTRAL_FL_ICE_PREVIEW.stagingBatchId,
        selectedCandidateIds
      });
      assertInspectionMatchesCheckpoint(resumeInspection(), latest);
      const previewArtifact = await putStableArtifact(workspace, {
        approvalPreview,
        executionPreview
      });
      assertInspectionMatchesCheckpoint(resumeInspection(), latest);
      const before = await readWorkspaceSnapshot(workspace);
      const approval = requireLegacySuccess(await runtime.approveStaging({
        sourceCollectionId: CENTRAL_FL_ICE_PREVIEW.sourceCollectionId,
        scanBatchId: CENTRAL_FL_ICE_PREVIEW.scanBatchId,
        legacyReportId: report.legacyReportId,
        stagingBatchId: CENTRAL_FL_ICE_PREVIEW.stagingBatchId,
        approvedBy,
        approvedAssertionCandidateIds: selectedCandidateIds
      }), "legacy approve-staging");
      assertInspectionMatchesCheckpoint(resumeInspection(), latest);
      const staged = requireLegacySuccess(await runtime.stageApproved({
        sourceCollectionId: CENTRAL_FL_ICE_PREVIEW.sourceCollectionId,
        scanBatchId: CENTRAL_FL_ICE_PREVIEW.scanBatchId,
        legacyReportId: report.legacyReportId,
        stagingBatchId: CENTRAL_FL_ICE_PREVIEW.stagingBatchId
      }), "legacy stage");
      const after = await readWorkspaceSnapshot(workspace);
      assertOnlyAllowedNewEvents(before.events, after.events, new Set([
        "legacy.ontology.staging.approved",
        "assertion.proposed",
        "diagnostic.recorded"
      ]));
      const newEvents = eventsAddedByIdentity(before.events, after.events);
      const proposals = newEvents.filter((event) => event.type === "assertion.proposed");
      const readbackProposalIds = proposals.flatMap((event) =>
        event.type === "assertion.proposed" ? [event.payload.assertionId] : []
      ).sort(compareCodeUnits);
      const runtimeProposalIds = [...staged.proposedAssertionIds].sort(compareCodeUnits);
      if (stableJson(readbackProposalIds) !== stableJson(runtimeProposalIds)) {
        throw new Error("staged assertion proposal event readback does not match runtime result");
      }
      assertProposedAssertionsEvidenceBound(proposals, after);
      assertInspectionMatchesCheckpoint(resumeInspection(), latest);

      return checkpointStore.append({
        phase: "handoff-required",
        command: "stage",
        createdAt: now(),
        allowedNextCommand: "handoff",
        state: mergePreviewState(latest.state, {
          proposedAssertionIds: [...staged.proposedAssertionIds],
          eventIds: [...latest.state.eventIds, ...approval.eventIds, ...staged.eventIds],
          artifactHashes: [...latest.state.artifactHashes, previewArtifact.contentHash],
          commands: [...latest.state.commands, "stage"],
          counts: {
            ...latest.state.counts,
            approvedStagingCandidates: selectedCandidateIds.length,
            proposedAssertions: staged.proposedAssertionIds.length
          }
        })
      });
    });
  }

  async function handoff(): Promise<CentralFloridaIcePreviewCheckpoint> {
    const latest = requireTransition(checkpointStore, "handoff", "handoff-required");
    assertInspectionMatchesCheckpoint(resumeInspection(), latest);

    return withPreviewWorkspace(mountResolver, async (workspace) => {
      const runtime = legacyRuntimeFactory(workspace);
      const legacyReportId = requiredStateString(latest, "legacyReportId");
      const report = requireLegacySuccess(await runtime.report({
        sourceCollectionId: CENTRAL_FL_ICE_PREVIEW.sourceCollectionId,
        legacyReportId
      }), "legacy report");
      const quarantine = requireLegacySuccess(await runtime.quarantine({
        sourceCollectionId: CENTRAL_FL_ICE_PREVIEW.sourceCollectionId,
        legacyReportId
      }), "legacy quarantine");
      const providerBlocker = {
        code: "provider-mounted-authority-unavailable",
        message: "Repository-approved provider byte-transfer and mounted prompt authority are not available for autonomous dispatch on this code base.",
        resumable: true,
        allowedNextCommand: "handoff" as const
      };
      const blockers = [providerBlocker];
      const handoff = {
        schemaVersion: "central-fl-ice-preview-handoff.v1",
        sourceCollectionId: CENTRAL_FL_ICE_PREVIEW.sourceCollectionId,
        legacyReportId: report.legacyReportId,
        reportHash: report.reportHash,
        candidateSetHash: report.candidateSetHash,
        proposedAssertionIds: latest.state.proposedAssertionIds ?? [],
        prioritizedEvidenceGaps: prioritizedEvidenceGaps(report.report),
        nextInvestigativeActions: nextInvestigativeActions(report.report),
        uncertainty: uncertaintyNotes(report.report),
        dependencies: blockers.map((blocker) => blocker.message),
        riskNotes: [
          "Legacy structure remains evidence only.",
          "No accepted graph state, request send, legal escalation, publication, or destructive effect is authorized."
        ],
        draftTaskCandidates: draftTaskCandidates(report.report),
        draftPrrCandidates: draftPrrCandidates(report.report),
        specialist: {
          status: "blocked",
          blocker: providerBlocker
        }
      };
      assertInspectionMatchesCheckpoint(resumeInspection(), latest);
      const artifact = await putStableArtifact(workspace, handoff);
      assertInspectionMatchesCheckpoint(resumeInspection(), latest);

      return checkpointStore.append({
        phase: "replay-verification-required",
        command: "handoff",
        createdAt: now(),
        allowedNextCommand: "verify-replay",
        state: mergePreviewState(latest.state, {
          handoffArtifactHash: artifact.contentHash,
          eventIds: latest.state.eventIds,
          artifactHashes: [...latest.state.artifactHashes, artifact.contentHash],
          commands: [...latest.state.commands, "handoff"],
          blockers: [...latest.state.blockers, ...blockers],
          counts: {
            ...latest.state.counts,
            prioritizedEvidenceGaps: handoff.prioritizedEvidenceGaps.length,
            draftTaskCandidates: handoff.draftTaskCandidates.length,
            draftPrrCandidates: handoff.draftPrrCandidates.length
          }
        })
      });
    });
  }

  async function verifyReplay(): Promise<CentralFloridaIcePreviewCheckpoint> {
    const latest = requireTransition(
      checkpointStore,
      "verify-replay",
      "replay-verification-required"
    );
    assertInspectionMatchesCheckpoint(resumeInspection(), latest);
    // `withPreviewWorkspace` closes the mounted SQLite ledger after the
    // callback. Opening here is therefore a true remount/readback boundary.
    return withPreviewWorkspace(mountResolver, async (workspace) => {
      const snapshot = await readWorkspaceSnapshot(workspace);
      assertNoForbiddenEvents(snapshot.events);
      const ingestion = buildIngestionProjection(snapshot.events);
      const legacy = buildLegacyImportProjection(snapshot.events);
      if (
        latest.state.legacyReportId === undefined
        || !legacy.reports.has(latest.state.legacyReportId)
      ) {
        throw new Error("legacy report projection did not reconstruct after remount");
      }
      const proposalEvents = snapshot.events.filter((event) => event.type === "assertion.proposed");
      const replayedProposalIds = proposalEvents.flatMap((event) =>
        event.type === "assertion.proposed" ? [event.payload.assertionId] : []
      ).sort(compareCodeUnits);
      const checkpointProposalIds = [...(latest.state.proposedAssertionIds ?? [])]
        .sort(compareCodeUnits);
      if (stableJson(replayedProposalIds) !== stableJson(checkpointProposalIds)) {
        throw new Error("assertion proposal projection did not reconstruct after remount");
      }
      for (const link of ingestion.evidenceLinks.values()) {
        const bytes = await workspace.blobStore.get(link.contentHash as `sha256:${string}`);
        const actualHash = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
        if (actualHash !== link.contentHash) {
          throw new Error("imported evidence blob failed content-hash replay verification");
        }
      }
      if (latest.state.handoffArtifactHash === undefined) {
        throw new Error("durable handoff artifact is missing from checkpoint state");
      }
      await workspace.derivativeStore.get(latest.state.handoffArtifactHash);
      for (const hash of latest.state.artifactHashes) {
        await workspace.derivativeStore.get(hash);
      }
      const replay = {
        schemaVersion: "central-fl-ice-preview-replay.v1",
        checkpointStateHash: latest.stateHash,
        ledgerEventCount: snapshot.events.length,
        evidenceLinkCount: ingestion.evidenceLinks.size,
        proposalCount: proposalEvents.length,
        reportId: latest.state.legacyReportId,
        handoffArtifactHash: latest.state.handoffArtifactHash,
        artifactHashes: latest.state.artifactHashes,
        reconstruction: "passed"
      };
      assertInspectionMatchesCheckpoint(resumeInspection(), latest);
      const artifact = await putStableArtifact(workspace, replay);
      assertInspectionMatchesCheckpoint(resumeInspection(), latest);

      return checkpointStore.append({
        phase: "manifest-required",
        command: "verify-replay",
        createdAt: now(),
        allowedNextCommand: "manifest",
        state: mergePreviewState(latest.state, {
          replayArtifactHash: artifact.contentHash,
          artifactHashes: [...latest.state.artifactHashes, artifact.contentHash],
          commands: [...latest.state.commands, "verify-replay"],
          counts: {
            ...latest.state.counts,
            ledgerEvents: snapshot.events.length,
            evidenceLinks: ingestion.evidenceLinks.size,
            replayedProposals: proposalEvents.length
          }
        })
      });
    });
  }

  async function manifest(): Promise<CentralFloridaIcePreviewCheckpoint> {
    const latest = requireTransition(checkpointStore, "manifest", "manifest-required");
    const revalidatedInspection = resumeInspection();
    assertInspectionMatchesCheckpoint(revalidatedInspection, latest);

    return withPreviewWorkspace(mountResolver, async (workspace) => {
      const snapshot = await readWorkspaceSnapshot(workspace);
      assertNoForbiddenEvents(snapshot.events);
      const manifestValue = {
        schemaVersion: "central-fl-ice-preview-final-manifest.v1",
        code: {
          baseSha: CENTRAL_FL_ICE_PREVIEW.codeBaseSha,
          executionSha: latest.state.codeSha
        },
        source: {
          identity: revalidatedInspection.sourceIdentity,
          identityHash: sha256(stableJson(revalidatedInspection.sourceIdentity))
        },
        destination: {
          identity: revalidatedInspection.destinationIdentity,
          identityHash: sha256(stableJson(
            stableDestinationAuthority(revalidatedInspection.destinationIdentity)
          ))
        },
        destinationWorkspace: CENTRAL_FL_ICE_PREVIEW.destinationRoot,
        workspaceId: CENTRAL_FL_ICE_PREVIEW.workspaceId,
        hashes: {
          candidateSetHash: latest.state.candidateSetHash,
          candidateArtifactHash: latest.state.candidateArtifactHash,
          inspectionArtifactHash: latest.state.inspectionArtifactHash,
          reportHash: latest.state.reportHash,
          legacyCandidateSetHash: latest.state.legacyCandidateSetHash,
          quarantineArtifactHash: latest.state.quarantineArtifactHash,
          dossierArtifactHash: latest.state.dossierArtifactHash,
          stagingPreviewArtifactHash: latest.state.stagingPreviewArtifactHash,
          handoffArtifactHash: latest.state.handoffArtifactHash,
          replayArtifactHash: latest.state.replayArtifactHash
        },
        eventIds: latest.state.eventIds,
        artifactHashes: latest.state.artifactHashes,
        counts: latest.state.counts,
        commands: [...latest.state.commands, "manifest"],
        validationResults: [
          "supervised-transition-chain:passed",
          "forbidden-event-scan:passed",
          "portable-remount-replay:passed",
          "evidence-content-hash-readback:passed"
        ],
        knownLimitations: latest.state.blockers.map((blocker) => blocker.message),
        unresolvedDefects: latest.state.blockers.map((blocker) => blocker.code),
        ledgerEventCount: snapshot.events.length
      };
      assertInspectionMatchesCheckpoint(resumeInspection(), latest);
      const artifact = await putStableArtifact(workspace, manifestValue);
      assertInspectionMatchesCheckpoint(resumeInspection(), latest);

      return checkpointStore.append({
        phase: "complete",
        command: "manifest",
        createdAt: now(),
        allowedNextCommand: null,
        state: mergePreviewState(latest.state, {
          finalManifestArtifactHash: artifact.contentHash,
          artifactHashes: [...latest.state.artifactHashes, artifact.contentHash],
          commands: [...latest.state.commands, "manifest"]
        })
      });
    });
  }

  return Object.freeze({
    inspect,
    rawImport,
    stagingPreview,
    stage,
    handoff,
    verifyReplay,
    manifest,
    status: () => checkpointStore.readAll()
  });
}

function createNodePreviewFilesystemPort(): PreviewFilesystemPort {
  return Object.freeze({
    exists: existsSync,
    realpath: (path: string) => realpathSync.native(path),
    lstat(path: string): PreviewPathMetadata {
      const metadata = lstatSync(path, { bigint: true });
      return {
        kind: metadata.isSymbolicLink()
          ? "symlink"
          : metadata.isDirectory()
            ? "directory"
            : metadata.isFile()
              ? "file"
              : "other",
        deviceId: metadata.dev.toString(),
        sizeBytes: Number(metadata.size),
        inode: metadata.ino.toString()
      };
    },
    readDirectory: (path: string) => readdirSync(path, { encoding: "utf8" }),
    readFile: (path: string) => readFileSync(path)
  });
}

function createFindmntPreviewMountInspectionPort(): PreviewMountInspectionPort {
  return Object.freeze({
    inspect(path: string): PreviewMountRecord {
      const output = execFileSync("findmnt", [
        "--json",
        "--output",
        "TARGET,SOURCE,FSTYPE,OPTIONS",
        "--target",
        path
      ], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"]
      });
      const parsed = JSON.parse(output) as unknown;
      const filesystem = exactFindmntFilesystem(parsed);
      const metadata = statSync(path, { bigint: true });
      return {
        target: filesystem.target,
        source: filesystem.source,
        fileSystem: filesystem.fstype,
        options: filesystem.options.split(",").filter((item) => item.length > 0),
        deviceId: metadata.dev.toString()
      };
    }
  });
}

function exactFindmntFilesystem(value: unknown): {
  target: string;
  source: string;
  fstype: string;
  options: string;
} {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("findmnt returned an invalid mount document");
  }
  const filesystems = (value as { filesystems?: unknown }).filesystems;
  if (!Array.isArray(filesystems) || filesystems.length !== 1) {
    throw new Error("findmnt did not resolve exactly one mount");
  }
  const filesystem = filesystems[0];
  if (
    typeof filesystem !== "object"
    || filesystem === null
    || Array.isArray(filesystem)
  ) {
    throw new Error("findmnt returned an invalid filesystem record");
  }
  const record = filesystem as Record<string, unknown>;
  for (const key of ["target", "source", "fstype", "options"] as const) {
    if (typeof record[key] !== "string" || record[key].length === 0) {
      throw new Error("findmnt returned an incomplete filesystem record");
    }
  }
  return {
    target: record.target as string,
    source: record.source as string,
    fstype: record.fstype as string,
    options: record.options as string
  };
}

function readCurrentGitSha(): string {
  const output = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: resolve(import.meta.dirname, "../../.."),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  }).trim();
  validateCodeSha(output);
  return output;
}

export function createFileCentralFloridaIcePreviewCheckpointStore(
  workspaceRoot: string
): CentralFloridaIcePreviewCheckpointStore {
  const checkpointRoot = join(workspaceRoot, "jobs", "central-fl-ice-engineering-preview");

  const readAll = (): readonly CentralFloridaIcePreviewCheckpoint[] => {
    if (!existsSync(checkpointRoot)) {
      return Object.freeze([]);
    }
    const names = readdirSync(checkpointRoot, { encoding: "utf8" });
    if (
      names.some((name) => !/^\d{6}-sha256-[a-f0-9]{64}\.json$/.test(name))
    ) {
      throw new Error("preview checkpoint directory contains an unexpected entry");
    }
    names.sort(compareCodeUnits);
    const checkpoints = names.map((name) => {
      const checkpoint = parsePreviewCheckpoint(
        JSON.parse(readFileSync(join(checkpointRoot, name), "utf8")) as unknown
      );
      const expectedName = `${String(checkpoint.sequence).padStart(6, "0")}-${checkpoint.stateHash.replace(":", "-")}.json`;
      if (name !== expectedName) {
        throw new Error("preview checkpoint filename does not match its sequence and state hash");
      }
      return checkpoint;
    });
    assertCheckpointChain(checkpoints);
    return Object.freeze(checkpoints);
  };

  return Object.freeze({
    readAll,
    append(draft: CentralFloridaIcePreviewCheckpointDraft): CentralFloridaIcePreviewCheckpoint {
      const previous = readAll().at(-1);
      const material = {
        schemaVersion: "central-fl-ice-preview-checkpoint.v1" as const,
        sequence: (previous?.sequence ?? 0) + 1,
        phase: draft.phase,
        command: draft.command,
        createdAt: draft.createdAt,
        previousStateHash: previous?.stateHash ?? null,
        allowedNextCommand: draft.allowedNextCommand,
        state: draft.state
      };
      const checkpoint = Object.freeze({
        ...material,
        stateHash: sha256(stableJson(material))
      });
      mkdirSync(checkpointRoot, { recursive: true });
      const name = `${String(checkpoint.sequence).padStart(6, "0")}-${checkpoint.stateHash.replace(":", "-")}.json`;
      writeFileSync(join(checkpointRoot, name), `${stableJson(checkpoint)}\n`, {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600
      });
      return checkpoint;
    }
  });
}

function parsePreviewCheckpoint(value: unknown): CentralFloridaIcePreviewCheckpoint {
  const checkpointKeys = [
    "schemaVersion",
    "sequence",
    "phase",
    "command",
    "createdAt",
    "previousStateHash",
    "allowedNextCommand",
    "state",
    "stateHash"
  ];
  if (!isExactJsonObject(value, checkpointKeys)) {
    throw new Error("preview checkpoint is not an object");
  }
  const checkpoint = value as CentralFloridaIcePreviewCheckpoint;
  const { stateHash, ...material } = checkpoint;
  const transitions: Readonly<Record<
    CentralFloridaIcePreviewPhase,
    readonly [CentralFloridaIcePreviewCommand, CentralFloridaIcePreviewCommand | null]
  >> = {
    "inspection-blocked": ["inspect", "inspect"],
    "raw-approval-required": ["inspect", "raw-import"],
    "staging-preview-required": ["raw-import", "staging-preview"],
    "staging-approval-required": ["staging-preview", "stage"],
    "handoff-required": ["stage", "handoff"],
    "replay-verification-required": ["handoff", "verify-replay"],
    "manifest-required": ["verify-replay", "manifest"],
    complete: ["manifest", null]
  };
  const expectedTransition = transitions[checkpoint.phase];
  if (
    checkpoint.schemaVersion !== "central-fl-ice-preview-checkpoint.v1"
    || !Number.isSafeInteger(checkpoint.sequence)
    || checkpoint.sequence < 1
    || typeof checkpoint.createdAt !== "string"
    || !Number.isFinite(Date.parse(checkpoint.createdAt))
    || expectedTransition === undefined
    || checkpoint.command !== expectedTransition[0]
    || checkpoint.allowedNextCommand !== expectedTransition[1]
    || !validOptionalHash(checkpoint.previousStateHash)
    || !validPreviewState(checkpoint.state)
    || !/^sha256:[a-f0-9]{64}$/.test(checkpoint.stateHash)
    || sha256(stableJson(material)) !== stateHash
  ) {
    throw new Error("preview checkpoint failed deterministic hash validation");
  }
  return Object.freeze({
    ...checkpoint,
    state: stablePreviewState(checkpoint.state)
  });
}

function validPreviewState(value: unknown): value is CentralFloridaIcePreviewDurableState {
  const requiredKeys = ["codeSha", "eventIds", "artifactHashes", "commands", "counts", "blockers"];
  const optionalHashKeys = [
    "candidateSetHash",
    "sourceIdentityHash",
    "destinationIdentityHash",
    "candidateArtifactHash",
    "inspectionArtifactHash",
    "reportHash",
    "legacyCandidateSetHash",
    "quarantineArtifactHash",
    "dossierArtifactHash",
    "stagingPreviewArtifactHash",
    "handoffArtifactHash",
    "replayArtifactHash",
    "finalManifestArtifactHash"
  ];
  const optionalStringKeys = ["legacyReportId"];
  const optionalArrayKeys = ["stagingCandidateIds", "proposedAssertionIds"];
  if (
    !isJsonObjectWithAllowedKeys(
      value,
      requiredKeys,
      [...requiredKeys, ...optionalHashKeys, ...optionalStringKeys, ...optionalArrayKeys]
    )
  ) {
    return false;
  }
  const state = value as unknown as Record<string, unknown>;
  if (
    typeof state.codeSha !== "string"
    || !/^[a-f0-9]{40}$/.test(state.codeSha)
    || optionalHashKeys.some((key) =>
      state[key] !== undefined && !validHash(state[key])
    )
    || optionalStringKeys.some((key) =>
      state[key] !== undefined
      && (typeof state[key] !== "string" || state[key].length === 0)
    )
    || optionalArrayKeys.some((key) =>
      state[key] !== undefined && !validStringArray(state[key], true)
    )
    || !validStringArray(state.eventIds, false)
    || !validStringArray(state.artifactHashes, false)
    || (state.artifactHashes as readonly string[]).some((hash) => !validHash(hash))
    || !validStringArray(state.commands, false)
    || (state.commands as readonly string[]).some((command) => !isPreviewCommand(command))
    || !isJsonObjectWithAllowedKeys(state.counts, [], Object.keys(state.counts as object))
    || Object.values(state.counts as Record<string, unknown>).some((count) =>
      !Number.isSafeInteger(count) || (count as number) < 0
    )
    || !Array.isArray(state.blockers)
    || (state.blockers as readonly unknown[]).some((blocker) => !validPreviewBlocker(blocker))
  ) {
    return false;
  }
  return true;
}

function validPreviewBlocker(value: unknown): value is CentralFloridaIcePreviewBlocker {
  if (!isExactJsonObject(value, [
    "code",
    "message",
    "resumable",
    "allowedNextCommand"
  ])) {
    return false;
  }
  const blocker = value as unknown as Record<string, unknown>;
  return typeof blocker.code === "string"
    && blocker.code.length > 0
    && typeof blocker.message === "string"
    && blocker.message.length > 0
    && blocker.resumable === true
    && isPreviewCommand(blocker.allowedNextCommand);
}

function validOptionalHash(value: unknown): boolean {
  return value === null || validHash(value);
}

function validHash(value: unknown): value is `sha256:${string}` {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
}

function validStringArray(value: unknown, requireUnique: boolean): value is readonly string[] {
  if (
    !Array.isArray(value)
    || value.some((item) => typeof item !== "string" || item.length === 0)
  ) {
    return false;
  }
  return !requireUnique || new Set(value).size === value.length;
}

function isPreviewCommand(value: unknown): value is CentralFloridaIcePreviewCommand {
  return value === "inspect"
    || value === "raw-import"
    || value === "staging-preview"
    || value === "stage"
    || value === "handoff"
    || value === "verify-replay"
    || value === "manifest";
}

function isExactJsonObject(value: unknown, keys: readonly string[]): boolean {
  return isJsonObjectWithAllowedKeys(value, keys, keys);
}

function isJsonObjectWithAllowedKeys(
  value: unknown,
  requiredKeys: readonly string[],
  allowedKeys: readonly string[]
): boolean {
  if (
    typeof value !== "object"
    || value === null
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return false;
  }
  const actualKeys = Object.keys(value);
  return actualKeys.every((key) => allowedKeys.includes(key))
    && requiredKeys.every((key) => Object.hasOwn(value, key));
}

function assertCheckpointChain(
  checkpoints: readonly CentralFloridaIcePreviewCheckpoint[]
): void {
  for (const [index, checkpoint] of checkpoints.entries()) {
    const previous = checkpoints[index - 1];
    if (
      checkpoint.sequence !== index + 1
      || checkpoint.previousStateHash !== (previous?.stateHash ?? null)
    ) {
      throw new Error("preview checkpoint chain is not append-only");
    }
  }
}

async function withPreviewWorkspace<T>(
  resolver: IngestionWorkspaceMountResolver,
  operation: (workspace: MountedWorkspace) => Promise<T>
): Promise<T> {
  const mounted = await resolver.resolve({
    workspaceRoot: CENTRAL_FL_ICE_PREVIEW.destinationRoot
  });
  if (!mounted.ok) {
    throw new Error("canonical portable preview workspace is unavailable");
  }
  if (mounted.workspace.workspaceId !== CENTRAL_FL_ICE_PREVIEW.workspaceId) {
    closeMountedWorkspace(mounted.workspace);
    throw new Error("canonical portable preview workspace identity mismatch");
  }
  try {
    return await operation(mounted.workspace);
  } finally {
    closeMountedWorkspace(mounted.workspace);
  }
}

function closeMountedWorkspace(workspace: MountedWorkspace): void {
  const close = (workspace as MountedWorkspace & { close?: () => void }).close;
  close?.call(workspace);
}

async function readPreviewWorkspaceSnapshot(
  workspace: MountedWorkspace
): Promise<CentralFloridaIcePreviewWorkspaceSnapshot> {
  const events = await workspace.ledger.readAll();
  assertNoForbiddenEvents(events);
  const projection = buildIngestionProjection(events);
  return Object.freeze({
    events: Object.freeze(events),
    occurrences: Object.freeze([...projection.occurrencesById.values()].map((occurrence) =>
      Object.freeze({
        occurrenceId: occurrence.occurrenceId,
        sourceCollectionId: occurrence.sourceCollectionId,
        scanBatchId: occurrence.scanBatchId,
        sourcePath: occurrence.sourcePath,
        contentHash: occurrence.contentHash as `sha256:${string}`
      })
    )),
    evidenceLinks: Object.freeze([...projection.evidenceLinks.values()].map((link) =>
      Object.freeze({
        eventId: link.linkedEventId,
        evidenceId: link.evidenceId,
        importBatchId: link.importBatchId,
        sourceCollectionId: link.sourceCollectionId,
        contentHash: link.contentHash as `sha256:${string}`,
        occurrenceIds: Object.freeze([...link.occurrenceIds])
      })
    ))
  });
}

function stablePreviewState(
  state: CentralFloridaIcePreviewDurableState
): CentralFloridaIcePreviewDurableState {
  return Object.freeze({
    ...state,
    ...(state.stagingCandidateIds === undefined
      ? {}
      : { stagingCandidateIds: Object.freeze([...state.stagingCandidateIds]) }),
    ...(state.proposedAssertionIds === undefined
      ? {}
      : { proposedAssertionIds: Object.freeze([...state.proposedAssertionIds]) }),
    eventIds: Object.freeze([...state.eventIds]),
    artifactHashes: Object.freeze([...state.artifactHashes]),
    commands: Object.freeze([...state.commands]),
    counts: Object.freeze({ ...state.counts }),
    blockers: Object.freeze(state.blockers.map((blocker) => Object.freeze({ ...blocker })))
  });
}

function mergePreviewState(
  state: CentralFloridaIcePreviewDurableState,
  patch: Partial<CentralFloridaIcePreviewDurableState>
): CentralFloridaIcePreviewDurableState {
  return stablePreviewState({ ...state, ...patch });
}

function requireTransition(
  store: CentralFloridaIcePreviewCheckpointStore,
  command: CentralFloridaIcePreviewCommand,
  phase: CentralFloridaIcePreviewPhase
): CentralFloridaIcePreviewCheckpoint {
  const latest = store.readAll().at(-1);
  if (latest === undefined || latest.phase !== phase || latest.allowedNextCommand !== command) {
    transitionFailure(command, latest);
  }
  return latest;
}

function requiredStateString(
  checkpoint: CentralFloridaIcePreviewCheckpoint,
  field: "legacyReportId"
): string {
  const value = checkpoint.state[field];
  if (value === undefined) {
    throw new Error(`preview checkpoint is missing required ${field}`);
  }
  return value;
}

function transitionFailure(
  command: CentralFloridaIcePreviewCommand,
  latest: CentralFloridaIcePreviewCheckpoint | undefined
): never {
  throw new Error(
    `${command} approval is not the allowed next transition`
      + (latest === undefined ? "" : ` after ${latest.phase}`)
  );
}

function humanIdentity(value: string): string {
  if (
    !/^actor_human_[a-zA-Z0-9_-]+$/.test(value)
    || /token|secret|credential|password|oauth|api[_-]?key/i.test(value)
  ) {
    throw new Error("explicit secret-safe human approval identity is required");
  }
  return value;
}

function exactCandidateSelection(
  values: readonly string[],
  eligible: readonly string[]
): string[] {
  const selected = [...values].sort(compareCodeUnits);
  if (
    selected.length === 0
    || new Set(selected).size !== selected.length
    || selected.some((candidateId) => !eligible.includes(candidateId))
  ) {
    throw new Error("stage candidates must be a unique non-empty subset of the exact staging preview");
  }
  return selected;
}

function requireLegacySuccess<T extends { readonly ok: boolean }>(
  result: T,
  command: string
): Extract<T, { readonly ok: true }> {
  if (!result.ok) {
    throw new Error(`${command} failed closed`);
  }
  return result as Extract<T, { readonly ok: true }>;
}

async function putStableArtifact(
  workspace: MountedWorkspace,
  value: unknown
): Promise<{ readonly contentHash: `sha256:${string}`; readonly sizeBytes: number; readonly path: string }> {
  return workspace.derivativeStore.put(Buffer.from(stableJson(value), "utf8"));
}

function assertReportMatchesInspection(
  report: LegacyMigrationReport,
  inspection: CentralFloridaIceCandidateInspection
): void {
  const reportFiles = [...report.files]
    .map((file) => ({
      occurrenceId: file.occurrenceId,
      sourcePath: file.sourcePath,
      contentHash: file.contentHash,
      mediaType: file.mediaType,
      sizeBytes: file.sizeBytes
    }))
    .sort((left, right) => compareCodeUnits(left.sourcePath, right.sourcePath));
  const candidates = inspection.candidates.map((candidate) => ({
    occurrenceId: candidate.occurrenceId,
    sourcePath: candidate.sourcePath,
    contentHash: candidate.contentHash,
    mediaType: candidate.mediaType,
    sizeBytes: candidate.sizeBytes
  }));
  if (stableJson(reportFiles) !== stableJson(candidates)) {
    throw new Error("legacy migration report does not bind the exact preflight candidate bytes");
  }
}

function assertInspectionMatchesCheckpoint(
  inspection: CentralFloridaIceCandidateInspection,
  checkpoint: CentralFloridaIcePreviewCheckpoint
): void {
  if (
    inspection.code.codeSha !== checkpoint.state.codeSha
    || inspection.candidateSetHash !== checkpoint.state.candidateSetHash
    || sha256(stableJson(inspection.sourceIdentity)) !== checkpoint.state.sourceIdentityHash
    || sha256(stableJson(
      stableDestinationAuthority(inspection.destinationIdentity)
    )) !== checkpoint.state.destinationIdentityHash
  ) {
    throw new Error("source candidate material or code identity changed since the supervised gate");
  }
}

function assertInspectionsMatch(
  expected: CentralFloridaIceCandidateInspection,
  actual: CentralFloridaIceCandidateInspection
): void {
  if (
    expected.code.codeSha !== actual.code.codeSha
    || expected.candidateSetHash !== actual.candidateSetHash
    || stableJson(expected.sourceIdentity) !== stableJson(actual.sourceIdentity)
    || stableJson(stableDestinationAuthority(expected.destinationIdentity))
      !== stableJson(stableDestinationAuthority(actual.destinationIdentity))
  ) {
    throw new Error("source or mount authority changed during the supervised runtime command");
  }
}

function stableDestinationAuthority(identity: PreviewDestinationIdentity) {
  return {
    destinationPath: identity.destinationPath,
    mountTarget: identity.mountTarget,
    mountSource: identity.mountSource,
    fileSystem: identity.fileSystem,
    mountOptions: [...identity.mountOptions],
    mountDeviceId: identity.mountDeviceId,
    parentDeviceId: identity.parentDeviceId
  };
}

function assertReportCheckpointIdentity(
  report: LegacyReportData,
  checkpoint: CentralFloridaIcePreviewCheckpoint
): void {
  if (
    report.legacyReportId !== checkpoint.state.legacyReportId
    || report.reportHash !== checkpoint.state.reportHash
    || report.candidateSetHash !== checkpoint.state.legacyCandidateSetHash
  ) {
    throw new Error("legacy report identity changed since the supervised gate");
  }
}

function assertEvidenceBindings(
  candidates: readonly PreviewRawImportCandidate[],
  snapshot: CentralFloridaIcePreviewWorkspaceSnapshot
): void {
  const occurrences = new Map(snapshot.occurrences.map((item) => [item.occurrenceId, item]));
  const linksByOccurrence = new Map<string, CentralFloridaIcePreviewWorkspaceSnapshot["evidenceLinks"][number]>();
  for (const link of snapshot.evidenceLinks) {
    for (const occurrenceId of link.occurrenceIds) {
      linksByOccurrence.set(occurrenceId, link);
    }
  }
  for (const candidate of candidates) {
    const occurrence = occurrences.get(candidate.occurrenceId);
    const link = linksByOccurrence.get(candidate.occurrenceId);
    if (
      occurrence === undefined
      || link === undefined
      || occurrence.sourceCollectionId !== candidate.sourceCollectionId
      || occurrence.scanBatchId !== candidate.scanBatchId
      || occurrence.sourcePath !== candidate.sourcePath
      || occurrence.contentHash !== candidate.contentHash
      || link.sourceCollectionId !== candidate.sourceCollectionId
      || link.importBatchId !== CENTRAL_FL_ICE_PREVIEW.importBatchId
      || link.contentHash !== candidate.contentHash
    ) {
      throw new Error("imported evidence lacks exact occurrence path hash or provenance binding");
    }
  }
}

function dossierEvidenceLinks(
  snapshot: CentralFloridaIcePreviewWorkspaceSnapshot
): {
  sourceCollectionId: string;
  evidenceId: string;
  contentHash: `sha256:${string}`;
  occurrenceIds: readonly string[];
}[] {
  return snapshot.evidenceLinks.map((link) => ({
    sourceCollectionId: link.sourceCollectionId,
    evidenceId: link.evidenceId,
    contentHash: link.contentHash,
    occurrenceIds: [...link.occurrenceIds]
  }));
}

function assertStageSelectionBindings(
  report: LegacyMigrationReport,
  preview: LegacyStagingPreviewData,
  selectedCandidateIds: readonly string[]
): void {
  if (
    preview.legacyReportId !== report.legacyReportId
    || preview.reportHash !== report.reportHash
    || preview.candidateSetHash !== report.candidateSetHash
  ) {
    throw new Error("staging preview is not bound to the current report");
  }
  const candidates = new Map(preview.candidates.map((candidate) => [candidate.candidateId, candidate]));
  for (const candidateId of selectedCandidateIds) {
    const candidate = candidates.get(candidateId);
    const reportCandidate = report.proposedAssertionCandidates.find((item) =>
      item.candidateId === candidateId
    );
    if (
      candidate === undefined
      || reportCandidate === undefined
      || candidate.evidenceContentHash !== reportCandidate.evidenceContentHash
    ) {
      throw new Error("staging selection lacks exact evidence-bound report provenance");
    }
  }
}

function assertProposedAssertionsEvidenceBound(
  proposals: readonly KnowledgeEvent[],
  snapshot: CentralFloridaIcePreviewWorkspaceSnapshot
): void {
  const evidenceIds = new Set(snapshot.evidenceLinks.map((link) => link.evidenceId));
  for (const event of proposals) {
    if (
      event.type !== "assertion.proposed"
      || !evidenceIds.has(event.payload.evidenceId)
      || event.payload.reviewState !== "proposed"
    ) {
      throw new Error("staged ontology event is not an evidence-bound assertion proposal");
    }
  }
}

function assertOnlyAllowedNewEvents(
  before: readonly KnowledgeEvent[],
  after: readonly KnowledgeEvent[],
  allowed: ReadonlySet<string>
): void {
  assertNoForbiddenEvents(after);
  for (const event of eventsAddedByIdentity(before, after)) {
    if (!allowed.has(event.type)) {
      throw new Error(`preview command appended forbidden event type ${event.type}`);
    }
  }
}

function assertNoForbiddenEvents(events: readonly KnowledgeEvent[]): void {
  for (const event of events) {
    if (!previewAllowedEventTypes.has(event.type)) {
      throw new Error(`preview workspace contains forbidden event type ${event.type}`);
    }
  }
}

const previewAllowedEventTypes = new Set<KnowledgeEvent["type"]>([
  "ingestion.source.registered",
  "ingestion.scan.started",
  "ingestion.occurrence.observed",
  "ingestion.scan.completed",
  "legacy.import.report.generated",
  "diagnostic.recorded",
  "ingestion.import.approved",
  "evidence.ingested",
  "ingestion.evidence.linked",
  "ingestion.import.completed",
  "ingestion.parse.job.created",
  "legacy.ontology.staging.approved",
  "assertion.proposed"
]);

function eventsAddedByIdentity(
  before: readonly KnowledgeEvent[],
  after: readonly KnowledgeEvent[]
): KnowledgeEvent[] {
  const ids = new Set(before.map((event) => event.id));
  return after.filter((event) => !ids.has(event.id));
}

function newEventIds(
  before: readonly KnowledgeEvent[],
  after: readonly KnowledgeEvent[]
): string[] {
  return eventsAddedByIdentity(before, after).map((event) => event.id);
}

function prioritizedEvidenceGaps(report: LegacyMigrationReport) {
  return report.quarantineEntries
    .map((entry) => ({
      priority: entry.issueCategory === "unsafe" ? 1 : 2,
      sourcePath: entry.sourcePath,
      category: entry.issueCategory,
      repairActions: entry.repairActions
    }))
    .sort((left, right) =>
      left.priority - right.priority
      || compareCodeUnits(left.sourcePath, right.sourcePath)
    );
}

function nextInvestigativeActions(report: LegacyMigrationReport) {
  return [
    ...report.recommendedNextActions.map((action, index) => ({
      priority: index + 1,
      action,
      dependency: "human review"
    })),
    {
      priority: report.recommendedNextActions.length + 1,
      action: "Resolve quarantined and ambiguous legacy references from imported evidence.",
      dependency: "evidence review"
    }
  ];
}

function uncertaintyNotes(report: LegacyMigrationReport): string[] {
  return [
    `${report.totals.quarantineEntries} legacy items remain quarantined.`,
    `${report.totals.unresolvedReferences} legacy references remain unresolved.`,
    "No proposed assertion is accepted ontology truth."
  ];
}

function draftTaskCandidates(report: LegacyMigrationReport) {
  return prioritizedEvidenceGaps(report).map((gap, index) => ({
    draftId: `draft_task_${String(index + 1).padStart(3, "0")}`,
    title: `Review ${gap.category} evidence at ${gap.sourcePath}`,
    status: "draft",
    sendPermitted: false
  }));
}

function draftPrrCandidates(report: LegacyMigrationReport) {
  return report.quarantineEntries
    .filter((entry) => entry.issueCategory === "stale-reference")
    .map((entry, index) => ({
      draftId: `draft_prr_${String(index + 1).padStart(3, "0")}`,
      sourcePath: entry.sourcePath,
      status: "draft",
      sendPermitted: false
    }));
}
