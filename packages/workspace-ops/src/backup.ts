import { createHash } from "node:crypto";
import {
  createWorkspaceOpsEnvelope,
  isSecretSafeWorkspaceText,
  manifestExportDtoSchema,
  workspaceOpsSchemaVersion,
  type BackupCheckDto,
  type DiskUsageDto,
  type ManifestExportDto,
  type ProposedRepairActionInput,
  type WorkspaceDiagnosticInput,
  type WorkspaceNextCommandHintDto,
  type WorkspaceOpsEnvelope,
  type WorkspaceRefDto
} from "./contracts.js";
import type { ResolvedWorkspaceLayout } from "./layout.js";

type WorkspaceRootCategory = DiskUsageDto["categories"][number]["category"];
type ManifestSection = ManifestExportDto["includedSections"][number];
type ManifestArtifact = ManifestExportDto["artifacts"][number];
type SectionHash = ManifestExportDto["sectionHashes"][number];
type DescriptorCloneResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false };

export interface ExportWorkspaceManifestInput {
  readonly workspace: WorkspaceRefDto;
  readonly layout: ResolvedWorkspaceLayout;
  readonly ledgerEventCount: number;
  readonly ledgerHighWaterMark?: number;
  readonly categoryBytes: readonly DiskUsageDto["categories"][number][];
  readonly diagnosticCounts?: {
    readonly errorCount: number;
    readonly warningCount: number;
  };
  readonly jobCounts?: {
    readonly queuedCount: number;
    readonly failedCount: number;
  };
  readonly createdAt: string;
}

export interface BackupManifestInput {
  readonly workspaceId: string;
  readonly layoutContractVersion: string;
  readonly ledgerHighWaterMark?: number;
  readonly ledgerEventCount?: number;
  readonly coveredCategories: readonly string[];
  readonly exportedAt: string;
}

export interface CheckBackupManifestInput {
  readonly workspace: WorkspaceRefDto;
  readonly currentLedgerHighWaterMark: number;
  readonly expectedCategories?: readonly WorkspaceRootCategory[];
  readonly backupManifest: BackupManifestInput | ManifestExportDto | undefined;
}

interface NormalizedBackupManifestInput {
  readonly workspaceId: WorkspaceRefDto["workspaceId"];
  readonly layoutContractVersion: string;
  readonly ledgerHighWaterMark?: number;
  readonly ledgerEventCount?: number;
  readonly coveredCategories: readonly WorkspaceRootCategory[];
  readonly exportedAt: string;
}

interface BackupManifestShapeInspection {
  readonly valid: boolean;
  readonly containsUnsafeFields: boolean;
  readonly data?: NormalizedBackupManifestInput;
}

const workspaceRootCategories = [
  "manifest",
  "ledger",
  "blobs",
  "derivatives",
  "jobs",
  "projections",
  "diagnostics",
  "backups"
] as const satisfies readonly WorkspaceRootCategory[];

const secretFieldPattern =
  /(?:^|[^a-z0-9])(?:access[\s._-]*token|api[\s._-]*key|authorization|bearer|token|password|private[\s._-]*key|client[\s._-]*secret|refresh[\s._-]*secret|session[\s._-]*secret|oauth|credential)/i;
const allowedBackupManifestKeys = new Set([
  "workspaceId",
  "layoutContractVersion",
  "ledgerHighWaterMark",
  "ledgerEventCount",
  "coveredCategories",
  "exportedAt"
]);
const requiredBackupManifestKeys = [
  "workspaceId",
  "layoutContractVersion",
  "coveredCategories",
  "exportedAt"
] as const;
const rawStateFieldPattern =
  /(?:canonical|ledger|event|events|payload|payloads|evidence|blob|path|paths|raw|content|contents|body|bodies|correspondence)/i;

export async function exportWorkspaceManifest(
  input: ExportWorkspaceManifestInput
): Promise<WorkspaceOpsEnvelope<ManifestExportDto>> {
  const exportedAt = normalizeExportedAt(input.createdAt);
  const coveredCategories = safeCoveredCategories(input.categoryBytes.map((category) => category.category));
  const missingCategories = missingCategoriesFor(workspaceRootCategories, coveredCategories);
  const includedSections = includedSectionsFor(coveredCategories);
  const artifacts = artifactSummaries(input.categoryBytes);
  const ledger = {
    eventCount: input.ledgerEventCount,
    highWaterMark: input.ledgerHighWaterMark ?? input.ledgerEventCount
  };
  const blobStore = {
    contentAddressedRootCount: coveredCategories.includes("blobs") ? 1 : 0,
    aggregateBytes: bytesForCategory(input.categoryBytes, "blobs")
  };
  const diagnostics = {
    errorCount: input.diagnosticCounts?.errorCount ?? 0,
    warningCount: input.diagnosticCounts?.warningCount ?? 0
  };
  const jobs = {
    queuedCount: input.jobCounts?.queuedCount ?? 0,
    failedCount: input.jobCounts?.failedCount ?? 0
  };
  const coverage = { coveredCategories, missingCategories };
  const sectionHashes = sectionHashesFor({
    workspace: input.workspace,
    layoutContractVersion: input.layout.layoutContractVersion,
    ledger,
    blobStore,
    artifacts,
    diagnostics,
    jobs,
    coverage
  }, includedSections);
  const manifestWithoutHash = {
    schemaVersion: workspaceOpsSchemaVersion,
    workspace: input.workspace,
    exportedAt,
    includedSections,
    excludedSecretBearingFields: [
      "external auth fields",
      "raw evidence content",
      "raw correspondence bodies",
      "canonical event payloads"
    ],
    ledger,
    blobStore,
    artifacts,
    diagnostics,
    jobs,
    coverage,
    sectionHashes
  } satisfies Omit<ManifestExportDto, "manifestHash">;
  const payload: ManifestExportDto = {
    ...manifestWithoutHash,
    manifestHash: hashJson(manifestWithoutHash)
  };

  return createWorkspaceOpsEnvelope({
    command: "manifest export",
    status: "ready",
    workspace: input.workspace,
    payload
  });
}

export async function checkBackupManifest(
  input: CheckBackupManifestInput
): Promise<WorkspaceOpsEnvelope<BackupCheckDto>> {
  const expectedCategories = input.expectedCategories ?? workspaceRootCategories;
  const backupManifestPresent = input.backupManifest !== undefined;
  const manifestShape = backupManifestPresent
    ? inspectBackupManifestShape(input.backupManifest)
    : { valid: false, containsUnsafeFields: false };
  const manifestShapeInvalid = backupManifestPresent && !manifestShape.valid;
  const backupManifest = manifestShape.valid ? manifestShape.data : undefined;
  const containsSecretShapedFields =
    backupManifestPresent &&
    (manifestShape.containsUnsafeFields || containsSecretShapedField(input.backupManifest) || manifestShapeInvalid);
  const backupWorkspaceId = backupManifest?.workspaceId;
  const backupLedgerHighWaterMark = nonnegativeInteger(
    backupManifest?.ledgerHighWaterMark ?? backupManifest?.ledgerEventCount
  );
  const coveredCategories = backupManifest === undefined ? [] : [...backupManifest.coveredCategories];
  const missingCategories = missingCategoriesFor(expectedCategories, coveredCategories);
  const identityMatches = backupManifestPresent && backupWorkspaceId === input.workspace.workspaceId;
  const layoutContractMatches =
    backupManifestPresent &&
    backupManifest?.layoutContractVersion === input.workspace.layoutContractVersion;
  const stale =
    !backupManifestPresent ||
    backupLedgerHighWaterMark === undefined ||
    backupLedgerHighWaterMark < input.currentLedgerHighWaterMark;

  const diagnostics = backupDiagnostics({
    backupManifestPresent,
    manifestShapeInvalid,
    containsSecretShapedFields,
    identityMatches,
    layoutContractMatches,
    stale,
    missingCategories
  });
  const safeNextActions = diagnostics.length === 0 ? [] : [exportManifestNextAction()];
  const payload: BackupCheckDto = {
    schemaVersion: workspaceOpsSchemaVersion,
    backupManifestPresent,
    identityMatches,
    layoutContractMatches,
    currentWorkspaceId: input.workspace.workspaceId,
    ...(backupWorkspaceId === undefined ? {} : { backupWorkspaceId }),
    currentLedgerHighWaterMark: input.currentLedgerHighWaterMark,
    ...(backupLedgerHighWaterMark === undefined ? {} : { backupLedgerHighWaterMark }),
    coveredCategories,
    missingCategories,
    stale,
    containsSecretShapedFields,
    safeNextActions
  };

  return createWorkspaceOpsEnvelope({
    command: "backup check",
    status: diagnostics.length === 0 ? "ready" : "degraded",
    workspace: input.workspace,
    payload,
    diagnostics,
    proposedActions: diagnostics.length === 0 ? [] : [exportManifestAction()]
  });
}

function normalizeExportedAt(createdAt: string): string {
  return new Date(createdAt).toISOString();
}

function includedSectionsFor(categories: readonly WorkspaceRootCategory[]): ManifestSection[] {
  const sections = new Set<ManifestSection>(["workspace", "manifest", "layout"]);
  for (const category of categories) {
    sections.add(sectionForCategory(category));
  }
  return Array.from(sections).sort(compareCodeUnits);
}

function sectionForCategory(category: WorkspaceRootCategory): ManifestSection {
  return category === "backups" ? "backup" : category;
}

function artifactSummaries(categories: readonly DiskUsageDto["categories"][number][]): ManifestArtifact[] {
  return [...categories]
    .sort((left, right) => compareCodeUnits(left.category, right.category))
    .map((category) => ({
      category: category.category,
      count: category.exists ? 1 : 0,
      bytes: category.bytes,
      ...(category.exists ? { artifactHash: hashJson({
        category: category.category,
        bytes: category.bytes,
        exists: category.exists
      }) } : {})
    }));
}

function sectionHashesFor(
  summary: {
    readonly workspace: WorkspaceRefDto;
    readonly layoutContractVersion: string;
    readonly ledger: ManifestExportDto["ledger"];
    readonly blobStore: ManifestExportDto["blobStore"];
    readonly artifacts: readonly ManifestArtifact[];
    readonly diagnostics: ManifestExportDto["diagnostics"];
    readonly jobs: ManifestExportDto["jobs"];
    readonly coverage: ManifestExportDto["coverage"];
  },
  includedSections: readonly ManifestSection[]
): SectionHash[] {
  return includedSections.map((sectionId) => ({
    sectionId,
    sectionHash: hashJson(sectionSummary(sectionId, summary))
  }));
}

function sectionSummary(
  sectionId: ManifestSection,
  summary: Parameters<typeof sectionHashesFor>[0]
): unknown {
  switch (sectionId) {
    case "workspace":
      return summary.workspace;
    case "manifest":
      return summary.coverage;
    case "layout":
      return { layoutContractVersion: summary.layoutContractVersion };
    case "ledger":
      return summary.ledger;
    case "blobs":
      return summary.blobStore;
    case "derivatives":
    case "projections":
    case "diagnostics":
    case "jobs":
    case "backup":
      return summary.artifacts.filter((artifact) => sectionForCategory(artifact.category) === sectionId);
  }
}

function backupDiagnostics(input: {
  readonly backupManifestPresent: boolean;
  readonly manifestShapeInvalid: boolean;
  readonly containsSecretShapedFields: boolean;
  readonly identityMatches: boolean;
  readonly layoutContractMatches: boolean;
  readonly stale: boolean;
  readonly missingCategories: readonly WorkspaceRootCategory[];
}): WorkspaceDiagnosticInput[] {
  const diagnostics: WorkspaceDiagnosticInput[] = [];
  if (!input.backupManifestPresent) {
    diagnostics.push(backupDiagnostic("diag_backup_manifest_missing", "Backup manifest is missing."));
    return diagnostics;
  }

  if (input.manifestShapeInvalid) {
    diagnostics.push(backupDiagnostic(
      "diag_backup_manifest_invalid",
      "Backup manifest shape is invalid; export a fresh safe manifest."
    ));
  }
  if (input.containsSecretShapedFields) {
    diagnostics.push(backupDiagnostic(
      "diag_backup_manifest_secret_fields",
      "Backup manifest contains fields that must be replaced with a safe manifest export."
    ));
  }
  if (!input.identityMatches) {
    diagnostics.push(backupDiagnostic(
      "diag_backup_workspace_mismatch",
      "Backup manifest belongs to a different workspace."
    ));
  }
  if (!input.layoutContractMatches) {
    diagnostics.push(backupDiagnostic(
      "diag_backup_layout_contract_mismatch",
      "Backup manifest uses a different layout contract."
    ));
  }
  if (input.stale) {
    diagnostics.push(backupDiagnostic(
      "diag_backup_manifest_stale",
      "Backup manifest is behind the workspace ledger."
    ));
  }
  if (input.missingCategories.length > 0) {
    diagnostics.push(backupDiagnostic(
      "diag_backup_coverage_missing",
      "Backup manifest is missing workspace category coverage."
    ));
  }
  return diagnostics;
}

function backupDiagnostic(
  diagnosticId: WorkspaceDiagnosticInput["diagnosticId"],
  message: string
): WorkspaceDiagnosticInput {
  return {
    diagnosticId,
    severity: "warning",
    category: "backup",
    message,
    durable: false,
    relatedIds: [],
    repairHint: {
      allowedNextCommands: ["manifest export", "backup check"],
      requiresHumanApproval: false
    }
  };
}

function exportManifestAction(): ProposedRepairActionInput {
  return {
    actionId: "action_export_workspace_manifest",
    kind: "export-manifest",
    title: "Export a fresh workspace manifest.",
    severity: "warning",
    requiresHumanApproval: false,
    mutatesCanonicalState: false,
    allowedNextCommands: ["manifest export", "backup check"]
  };
}

function exportManifestNextAction(): WorkspaceNextCommandHintDto {
  return {
    allowedNextCommands: ["manifest export", "backup check"],
    safeReason: "Export a fresh manifest and rerun backup checks.",
    requiresHumanApproval: false
  };
}

function safeCoveredCategories(categories: readonly string[]): WorkspaceRootCategory[] {
  const seen = new Set<string>();
  const safeCategories: WorkspaceRootCategory[] = [];
  for (const category of categories) {
    if (isWorkspaceRootCategory(category) && !seen.has(category)) {
      safeCategories.push(category);
      seen.add(category);
    }
  }
  return workspaceRootCategories.filter((category) => seen.has(category));
}

function missingCategoriesFor(
  expectedCategories: readonly WorkspaceRootCategory[],
  coveredCategories: readonly WorkspaceRootCategory[]
): WorkspaceRootCategory[] {
  const covered = new Set(coveredCategories);
  return workspaceRootCategories.filter((category) =>
    expectedCategories.includes(category) && !covered.has(category)
  );
}

function isWorkspaceRootCategory(category: string): category is WorkspaceRootCategory {
  return (workspaceRootCategories as readonly string[]).includes(category);
}

function safeWorkspaceId(workspaceId: unknown): WorkspaceRefDto["workspaceId"] | undefined {
  return typeof workspaceId === "string" &&
    /^ws_[a-zA-Z0-9_-]+$/.test(workspaceId) &&
    isSecretSafeWorkspaceText(workspaceId) &&
    !secretFieldPattern.test(workspaceId)
    ? workspaceId
    : undefined;
}

function nonnegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function bytesForCategory(
  categories: readonly DiskUsageDto["categories"][number][],
  category: WorkspaceRootCategory
): number {
  return categories.find((candidate) => candidate.category === category)?.bytes ?? 0;
}

function containsSecretShapedField(value: unknown, seen = new WeakSet<object>()): boolean {
  if (typeof value === "string") {
    return !isSecretSafeWorkspaceText(value);
  }
  if (typeof value !== "object" || value === null) {
    return false;
  }
  if (seen.has(value)) {
    return true;
  }
  seen.add(value);

  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || secretFieldPattern.test(key)) {
      return true;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !("value" in descriptor)) {
      return true;
    }
    if (containsSecretShapedField(descriptor.value, seen)) {
      return true;
    }
  }

  seen.delete(value);
  return false;
}

function inspectBackupManifestShape(
  value: unknown
): BackupManifestShapeInspection {
  if (typeof value !== "object" || value === null || Object.getPrototypeOf(value) !== Object.prototype) {
    return { valid: false, containsUnsafeFields: true };
  }

  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (isManifestExportCandidate(descriptors)) {
    return inspectManifestExportShape(value);
  }

  return inspectFlatBackupManifestShape(descriptors);
}

function inspectManifestExportShape(value: object): BackupManifestShapeInspection {
  const clonedManifest = descriptorSafeClone(value);
  if (!clonedManifest.ok) {
    return { valid: false, containsUnsafeFields: true };
  }

  const parseResult = manifestExportDtoSchema.safeParse(clonedManifest.value);
  if (!parseResult.success) {
    return { valid: false, containsUnsafeFields: true };
  }

  const manifest = parseResult.data;
  const coveredCategories = safeCoveredCategories(manifest.coverage.coveredCategories);
  const expectedIncludedSections = includedSectionsFor(coveredCategories);
  if (
    !isIsoDateTime(manifest.exportedAt) ||
    !exportManifestHashMatches(manifest) ||
    !sameStrings(manifest.includedSections, expectedIncludedSections) ||
    !manifestSectionHashesMatch(manifest) ||
    !artifactsSupportCoveredCategories(manifest.artifacts, coveredCategories) ||
    coveredCategories.length !== manifest.coverage.coveredCategories.length ||
    !sameCategories(manifest.coverage.missingCategories, missingCategoriesFor(workspaceRootCategories, coveredCategories))
  ) {
    return { valid: false, containsUnsafeFields: true };
  }

  return {
    valid: true,
    containsUnsafeFields: false,
    data: {
      workspaceId: manifest.workspace.workspaceId,
      layoutContractVersion: manifest.workspace.layoutContractVersion,
      ledgerHighWaterMark: manifest.ledger.highWaterMark,
      ledgerEventCount: manifest.ledger.eventCount,
      coveredCategories,
      exportedAt: manifest.exportedAt
    }
  };
}

function inspectFlatBackupManifestShape(
  descriptors: PropertyDescriptorMap
): BackupManifestShapeInspection {
  let valid = true;
  let containsUnsafeFields = false;

  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string") {
      valid = false;
      containsUnsafeFields = true;
      continue;
    }

    const descriptor = descriptors[key];
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
      valid = false;
      containsUnsafeFields = true;
      continue;
    }

    if (!allowedBackupManifestKeys.has(key)) {
      valid = false;
      containsUnsafeFields = true;
    }

    if (isUnsafeBackupManifestFieldName(key) || containsUnsafeBackupManifestField(descriptor.value)) {
      valid = false;
      containsUnsafeFields = true;
    }
  }

  for (const key of requiredBackupManifestKeys) {
    if (!Object.hasOwn(descriptors, key)) {
      valid = false;
    }
  }

  if (
    nonnegativeInteger(descriptorValue(descriptors, "ledgerHighWaterMark")) === undefined &&
    nonnegativeInteger(descriptorValue(descriptors, "ledgerEventCount")) === undefined
  ) {
    valid = false;
  }

  if (safeWorkspaceId(descriptorValue(descriptors, "workspaceId")) === undefined) {
    valid = false;
  }

  const layoutContractVersionValue = descriptorValue(descriptors, "layoutContractVersion");
  if (typeof layoutContractVersionValue !== "string" || !isSecretSafeWorkspaceText(layoutContractVersionValue)) {
    valid = false;
  }

  if (!isValidCategoryList(descriptorValue(descriptors, "coveredCategories"))) {
    valid = false;
  }

  if (!isIsoDateTime(descriptorValue(descriptors, "exportedAt"))) {
    valid = false;
  }

  if (!valid) {
    return { valid: false, containsUnsafeFields };
  }

  const workspaceId = safeWorkspaceId(descriptorValue(descriptors, "workspaceId"));
  const layoutContractVersion = descriptorValue(descriptors, "layoutContractVersion");
  const ledgerHighWaterMark = nonnegativeInteger(descriptorValue(descriptors, "ledgerHighWaterMark"));
  const ledgerEventCount = nonnegativeInteger(descriptorValue(descriptors, "ledgerEventCount"));
  const coveredCategories = categoryListValue(descriptorValue(descriptors, "coveredCategories"));
  const exportedAt = descriptorValue(descriptors, "exportedAt");
  if (
    workspaceId === undefined ||
    typeof layoutContractVersion !== "string" ||
    coveredCategories === undefined ||
    typeof exportedAt !== "string"
  ) {
    return { valid: false, containsUnsafeFields };
  }

  return {
    valid: true,
    containsUnsafeFields,
    data: {
      workspaceId,
      layoutContractVersion,
      ...(ledgerHighWaterMark === undefined ? {} : { ledgerHighWaterMark }),
      ...(ledgerEventCount === undefined ? {} : { ledgerEventCount }),
      coveredCategories,
      exportedAt
    }
  };
}

function isManifestExportCandidate(descriptors: PropertyDescriptorMap): boolean {
  return Object.hasOwn(descriptors, "schemaVersion") ||
    Object.hasOwn(descriptors, "workspace") ||
    Object.hasOwn(descriptors, "manifestHash") ||
    Object.hasOwn(descriptors, "coverage") ||
    Object.hasOwn(descriptors, "sectionHashes");
}

function exportManifestHashMatches(manifest: ManifestExportDto): boolean {
  const { manifestHash, ...manifestWithoutHash } = manifest;
  return manifestHash === hashJson(manifestWithoutHash);
}

function manifestSectionHashesMatch(manifest: ManifestExportDto): boolean {
  const expectedSectionHashes = sectionHashesFor({
    workspace: manifest.workspace,
    layoutContractVersion: manifest.workspace.layoutContractVersion,
    ledger: manifest.ledger,
    blobStore: manifest.blobStore,
    artifacts: manifest.artifacts,
    diagnostics: manifest.diagnostics,
    jobs: manifest.jobs,
    coverage: manifest.coverage
  }, manifest.includedSections);

  return manifest.sectionHashes.length === expectedSectionHashes.length &&
    manifest.sectionHashes.every((sectionHash, index) => {
      const expectedSectionHash = expectedSectionHashes[index];
      return expectedSectionHash !== undefined &&
        sectionHash.sectionId === expectedSectionHash.sectionId &&
        sectionHash.sectionHash === expectedSectionHash.sectionHash;
    });
}

function artifactsSupportCoveredCategories(
  artifacts: readonly ManifestArtifact[],
  coveredCategories: readonly WorkspaceRootCategory[]
): boolean {
  const artifactCategories = new Set(artifacts.map((artifact) => artifact.category));
  return coveredCategories.every((category) => artifactCategories.has(category));
}

function sameCategories(
  left: readonly WorkspaceRootCategory[],
  right: readonly WorkspaceRootCategory[]
): boolean {
  return left.length === right.length && left.every((category, index) => category === right[index]);
}

function sameStrings(
  left: readonly string[],
  right: readonly string[]
): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function descriptorSafeClone(value: unknown, seen = new WeakSet<object>()): DescriptorCloneResult {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return { ok: true, value };
  }
  if (typeof value !== "object") {
    return { ok: false };
  }
  if (seen.has(value)) {
    return { ok: false };
  }
  seen.add(value);

  if (Array.isArray(value)) {
    const arrayValue = descriptorSafeArrayValue(value, seen);
    seen.delete(value);
    return arrayValue === undefined ? { ok: false } : { ok: true, value: arrayValue };
  }

  if (Object.getPrototypeOf(value) !== Object.prototype) {
    seen.delete(value);
    return { ok: false };
  }

  const descriptors = Object.getOwnPropertyDescriptors(value);
  const clone: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string") {
      seen.delete(value);
      return { ok: false };
    }
    const descriptor = descriptors[key];
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
      seen.delete(value);
      return { ok: false };
    }
    const clonedValue = descriptorSafeClone(descriptor.value, seen);
    if (!clonedValue.ok) {
      seen.delete(value);
      return { ok: false };
    }
    clone[key] = clonedValue.value;
  }

  seen.delete(value);
  return { ok: true, value: clone };
}

function descriptorSafeArrayValue(value: unknown[], seen: WeakSet<object>): unknown[] | undefined {
  if (Object.getPrototypeOf(value) !== Array.prototype) {
    return undefined;
  }

  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (
      key !== "length" &&
      (typeof key !== "string" || !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length)
    ) {
      return undefined;
    }

    const descriptor = descriptors[key];
    if (key !== "length" && (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor))) {
      return undefined;
    }
  }

  const values: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (descriptor === undefined || !("value" in descriptor)) {
      return undefined;
    }
    const clonedValue = descriptorSafeClone(descriptor.value, seen);
    if (!clonedValue.ok) {
      return undefined;
    }
    values.push(clonedValue.value);
  }

  return values;
}

function descriptorValue(
  descriptors: PropertyDescriptorMap,
  key: string
): unknown {
  const descriptor = descriptors[key];
  return descriptor !== undefined && "value" in descriptor ? descriptor.value : undefined;
}

function isValidCategoryList(value: unknown): value is readonly WorkspaceRootCategory[] {
  return categoryListValue(value) !== undefined;
}

function categoryListValue(value: unknown): WorkspaceRootCategory[] | undefined {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    return undefined;
  }

  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (
      key !== "length" &&
      (typeof key !== "string" || !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length)
    ) {
      return undefined;
    }

    const descriptor = descriptors[key];
    if (key !== "length" && (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor))) {
      return undefined;
    }
  }

  const categories: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (descriptor === undefined || !("value" in descriptor) || typeof descriptor.value !== "string") {
      return undefined;
    }
    categories.push(descriptor.value);
  }

  return categories.every(isWorkspaceRootCategory) ? safeCoveredCategories(categories) : undefined;
}

function isIsoDateTime(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return false;
  }

  const timestamp = Date.parse(value);
  return !Number.isNaN(timestamp) && new Date(timestamp).toISOString() === value;
}

function isUnsafeBackupManifestFieldName(key: string): boolean {
  return secretFieldPattern.test(key) ||
    (!allowedBackupManifestKeys.has(key) && rawStateFieldPattern.test(key));
}

function containsUnsafeBackupManifestField(value: unknown, seen = new WeakSet<object>()): boolean {
  if (typeof value === "string") {
    return !isSecretSafeWorkspaceText(value);
  }
  if (typeof value !== "object" || value === null) {
    return false;
  }
  if (seen.has(value)) {
    return true;
  }
  seen.add(value);

  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || isUnsafeBackupManifestFieldName(key)) {
      return true;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !("value" in descriptor)) {
      return true;
    }
    if (containsUnsafeBackupManifestField(descriptor.value, seen)) {
      return true;
    }
  }

  seen.delete(value);
  return false;
}

function hashJson(value: unknown): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(stableJson(value), "utf8").digest("hex")}`;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value)
      .sort(([left], [right]) => compareCodeUnits(left, right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
