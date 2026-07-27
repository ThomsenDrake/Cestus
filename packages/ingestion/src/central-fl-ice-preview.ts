import { createHash } from "node:crypto";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { stableLocalFilesystemOccurrenceId } from "./local-filesystem.js";
import { sha256, stableJson } from "./legacy-report.js";

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
  const policy = CENTRAL_FL_ICE_PREVIEW;
  validatePolicy(policy);
  validateCodeSha(input.codeSha);

  const source = inspectSourceAuthority(dependencies, policy);
  const destinationIdentity = inspectDestinationAuthority(dependencies, policy, source.mount);
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
    codeSha: input.codeSha
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

  const rootMetadata = dependencies.filesystem.lstat(policy.sourceRoot);
  if (rootMetadata.kind !== "directory") {
    fail("SOURCE_ROOT_INVALID", "Selected source root is not a directory");
  }

  const mount = dependencies.mounts.inspect(policy.sourceRoot);
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
  sourceMountRecord: PreviewMountRecord
): PreviewDestinationIdentity {
  if (isPathWithin(policy.destinationRoot, policy.sourceMount)) {
    fail("DESTINATION_ON_SOURCE_MOUNT", "Preview destination is within the source mount");
  }

  const initiallyPresent = dependencies.filesystem.exists(policy.destinationRoot);
  if (initiallyPresent) {
    const destinationMetadata = dependencies.filesystem.lstat(policy.destinationRoot);
    if (destinationMetadata.kind !== "directory") {
      fail("DESTINATION_COLLISION", "Preview destination collides with non-directory content");
    }
    if (dependencies.filesystem.readDirectory(policy.destinationRoot).length !== 0) {
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

  const parentMetadata = dependencies.filesystem.lstat(nearestExistingParent);
  if (parentMetadata.kind !== "directory") {
    fail("DESTINATION_INVALID", "Preview destination parent is not a directory");
  }
  const destinationMount = dependencies.mounts.inspect(nearestExistingParent);
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

      const metadata = dependencies.filesystem.lstat(absolutePath);
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
    const before = dependencies.filesystem.lstat(file.absolutePath);
    assertSameMetadata(file.metadata, before);
    assertOnApprovedMount(dependencies, file.absolutePath, approvedMount, policy, before);

    const bytes = dependencies.filesystem.readFile(file.absolutePath);
    const after = dependencies.filesystem.lstat(file.absolutePath);
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
      scanStatus,
      preservationStatus: preservationStatusForPath(file.sourcePath),
      sourceCollectionId: policy.sourceCollectionId,
      scanBatchId: policy.scanBatchId
    }));
  }

  return Object.freeze(candidates);
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
  metadata = dependencies.filesystem.lstat(path)
): void {
  const mount = dependencies.mounts.inspect(path);
  if (
    mount.target !== approvedMount.target
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
