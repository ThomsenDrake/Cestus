import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { ZipArchiveAdapter, type ZipArchiveChild } from "./archive-adapter.js";
import { stableLocalFilesystemOccurrenceId } from "./local-filesystem.js";
import type { IngestionOccurrenceSummary } from "./projection.js";
import {
  stableIngestionError,
  type IngestionRuntimeError
} from "./runtime-types.js";

const archiveLimits = {
  maxEntries: 10000,
  maxExpandedBytes: 1024 * 1024 * 1024
};
const localFilesystemAdapter = { name: "local-filesystem", version: "0.1.0" } as const;

export interface MaterializedImportOccurrence {
  readonly occurrenceId: string;
  readonly content: Buffer;
  readonly sourcePath: string;
  readonly mediaType: string;
}

export interface MaterializeApprovedOccurrencesInput {
  readonly sourceRoot: string;
  readonly sourceCollectionId: string;
  readonly scanBatchId: string;
  readonly importBatchId: string;
  readonly occurrences: readonly IngestionOccurrenceSummary[];
}

export type MaterializeApprovedOccurrencesResult =
  | { readonly ok: true; readonly occurrences: readonly MaterializedImportOccurrence[] }
  | { readonly ok: false; readonly error: IngestionRuntimeError };

interface ExpandedArchive {
  readonly containerHash: `sha256:${string}`;
  readonly children: readonly ZipArchiveChild[];
}

type InventoryResult =
  | {
      readonly ok: true;
      readonly items: ReadonlyMap<string, InventoryItem>;
      readonly archiveContainerHashes: ReadonlyMap<string, `sha256:${string}`>;
    }
  | { readonly ok: false; readonly error: IngestionRuntimeError };

interface InventoryItem {
  readonly key: string;
  readonly kind: "regular" | "archive-child";
  readonly occurrenceId: string;
  readonly occurrence?: IngestionOccurrenceSummary;
  readonly contentHash: `sha256:${string}`;
  readonly sizeBytes: number;
  readonly content?: Buffer;
  readonly materializedSourcePath: string;
  readonly mediaTypePath: string;
  readonly containerPath?: string;
  readonly containerHash?: `sha256:${string}`;
  readonly internalPath?: string;
  readonly archiveAdapter?: { readonly name: string; readonly version: string };
}

export function materializeApprovedOccurrences(
  input: MaterializeApprovedOccurrencesInput
): MaterializeApprovedOccurrencesResult {
  const sourceRoot = resolve(input.sourceRoot);
  const approved = approvedInventoryFor(input.occurrences);

  if (!approved.ok) {
    return approved;
  }

  const current = currentInventoryFor(
    sourceRoot,
    input.sourceCollectionId,
    input.scanBatchId,
    approved.archiveContainerHashes
  );

  if (!current.ok) {
    return current;
  }

  const inventoryComparison = compareInventories(approved.items, current.items);

  if (!inventoryComparison.ok) {
    return inventoryComparison;
  }

  const materialized: MaterializedImportOccurrence[] = [];

  for (const occurrence of input.occurrences) {
    const currentItem = current.items.get(inventoryKeyForOccurrence(occurrence));

    if (currentItem?.content === undefined) {
      return isArchiveOccurrence(occurrence) ? archiveMismatchError() : sourceChangedError();
    }
    if (currentItem.occurrenceId !== occurrence.occurrenceId) {
      return isArchiveOccurrence(occurrence) ? archiveMismatchError() : sourceChangedError();
    }

    materialized.push({
      occurrenceId: occurrence.occurrenceId,
      content: currentItem.content,
      sourcePath: currentItem.materializedSourcePath,
      mediaType: mediaTypeFor(currentItem.mediaTypePath)
    });
  }

  return { ok: true, occurrences: materialized };
}

function approvedInventoryFor(occurrences: readonly IngestionOccurrenceSummary[]): InventoryResult {
  const items = new Map<string, InventoryItem>();
  const archiveContainerHashes = new Map<string, `sha256:${string}`>();

  for (const occurrence of occurrences) {
    if (!isLocalFilesystemOccurrence(occurrence)) {
      return sourceChangedError();
    }

    if (isArchiveOccurrence(occurrence)) {
      const previousContainerHash = archiveContainerHashes.get(occurrence.containerPath);
      if (previousContainerHash !== undefined && previousContainerHash !== occurrence.containerHash) {
        return archiveMismatchError();
      }

      archiveContainerHashes.set(occurrence.containerPath, occurrence.containerHash);
      const item: InventoryItem = {
        key: inventoryKeyForOccurrence(occurrence),
        kind: "archive-child",
        occurrenceId: occurrence.occurrenceId,
        occurrence,
        contentHash: asContentHash(occurrence.contentHash),
        sizeBytes: occurrence.sizeBytes,
        materializedSourcePath: `${occurrence.containerPath}!/${occurrence.internalPath}`,
        mediaTypePath: occurrence.internalPath,
        containerPath: occurrence.containerPath,
        containerHash: occurrence.containerHash,
        internalPath: occurrence.internalPath,
        archiveAdapter: occurrence.archiveAdapter
      };
      const duplicate = rememberApprovedItem(items, item);
      if (!duplicate.ok) {
        return duplicate;
      }
    } else {
      const item: InventoryItem = {
        key: inventoryKeyForOccurrence(occurrence),
        kind: "regular",
        occurrenceId: occurrence.occurrenceId,
        occurrence,
        contentHash: asContentHash(occurrence.contentHash),
        sizeBytes: occurrence.sizeBytes,
        materializedSourcePath: occurrence.sourcePath,
        mediaTypePath: occurrence.sourcePath
      };
      const duplicate = rememberApprovedItem(items, item);
      if (!duplicate.ok) {
        return duplicate;
      }
    }
  }

  return { ok: true, items, archiveContainerHashes };
}

function rememberApprovedItem(
  items: Map<string, InventoryItem>,
  item: InventoryItem
): { readonly ok: true } | { readonly ok: false; readonly error: IngestionRuntimeError } {
  const existing = items.get(item.key);

  if (existing !== undefined && !approvedItemsMatch(existing, item)) {
    return item.kind === "archive-child" ? archiveMismatchError() : sourceChangedError();
  }

  items.set(item.key, item);
  return { ok: true };
}

function approvedItemsMatch(left: InventoryItem, right: InventoryItem): boolean {
  return left.kind === right.kind &&
    left.occurrenceId === right.occurrenceId &&
    left.contentHash === right.contentHash &&
    left.sizeBytes === right.sizeBytes &&
    left.materializedSourcePath === right.materializedSourcePath &&
    left.mediaTypePath === right.mediaTypePath &&
    left.containerPath === right.containerPath &&
    left.containerHash === right.containerHash &&
    left.internalPath === right.internalPath &&
    left.archiveAdapter?.name === right.archiveAdapter?.name &&
    left.archiveAdapter?.version === right.archiveAdapter?.version;
}

function currentInventoryFor(
  sourceRoot: string,
  sourceCollectionId: string,
  scanBatchId: string,
  approvedArchiveContainerHashes: ReadonlyMap<string, `sha256:${string}`>
): InventoryResult {
  const archiveAdapter = new ZipArchiveAdapter();
  const items = new Map<string, InventoryItem>();
  const archiveContainerHashes = new Map<string, `sha256:${string}`>();
  let files: ScannedFile[];

  try {
    files = collectFiles(sourceRoot).sort((left, right) => compareCodeUnits(left.relativePath, right.relativePath));
  } catch {
    return sourceChangedError();
  }

  for (const file of files) {
    let content: Buffer;
    try {
      content = readFileSync(file.absolutePath);
    } catch {
      return sourceChangedError();
    }

    if (isZipPath(file.relativePath)) {
      const approvedContainerHash = approvedArchiveContainerHashes.get(file.relativePath);

      if (approvedContainerHash === undefined) {
        return archiveMismatchError();
      }

      const containerHash = sha256(content);
      if (containerHash !== approvedContainerHash) {
        return archiveMismatchError();
      }

      let archive: ExpandedArchive;
      try {
        archive = {
          containerHash,
          children: archiveAdapter.expand(content, {
            containerHash,
            ...archiveLimits
          })
        };
      } catch {
        return archiveMismatchError();
      }

      archiveContainerHashes.set(file.relativePath, containerHash);
      for (const child of archive.children) {
        const contentHash = sha256(child.content);
        items.set(archiveInventoryKey(file.relativePath, child.internalPath), {
          key: archiveInventoryKey(file.relativePath, child.internalPath),
          kind: "archive-child",
          occurrenceId: stableLocalFilesystemOccurrenceId({
            kind: "archive-child",
            sourceCollectionId,
            scanBatchId,
            sourcePath: file.relativePath,
            containerPath: file.relativePath,
            containerHash: child.containerHash,
            internalPath: child.internalPath,
            contentHash
          }),
          content: child.content,
          contentHash,
          sizeBytes: child.content.byteLength,
          materializedSourcePath: `${file.relativePath}!/${child.internalPath}`,
          mediaTypePath: child.internalPath,
          containerPath: file.relativePath,
          containerHash,
          internalPath: child.internalPath,
          archiveAdapter: { name: child.tool, version: child.version }
        });
      }
      continue;
    }

    const contentHash = sha256(content);
    items.set(regularInventoryKey(file.relativePath), {
      key: regularInventoryKey(file.relativePath),
      kind: "regular",
      occurrenceId: stableLocalFilesystemOccurrenceId({
        kind: "file",
        sourceCollectionId,
        scanBatchId,
        sourcePath: file.relativePath,
        contentHash
      }),
      content,
      contentHash,
      sizeBytes: content.byteLength,
      materializedSourcePath: file.relativePath,
      mediaTypePath: file.relativePath
    });
  }

  return { ok: true, items, archiveContainerHashes };
}

function compareInventories(
  approvedItems: ReadonlyMap<string, InventoryItem>,
  currentItems: ReadonlyMap<string, InventoryItem>
): { readonly ok: true } | { readonly ok: false; readonly error: IngestionRuntimeError } {
  for (const approvedItem of approvedItems.values()) {
    const currentItem = currentItems.get(approvedItem.key);

    if (currentItem === undefined) {
      return approvedItem.kind === "archive-child" ? archiveMismatchError() : sourceChangedError();
    }

    if (
      currentItem.kind !== approvedItem.kind ||
      currentItem.occurrenceId !== approvedItem.occurrenceId ||
      currentItem.contentHash !== approvedItem.contentHash ||
      currentItem.sizeBytes !== approvedItem.sizeBytes
    ) {
      return approvedItem.kind === "archive-child" ? archiveMismatchError() : sourceChangedError();
    }

    if (approvedItem.kind === "archive-child") {
      if (
        currentItem.containerHash !== approvedItem.containerHash ||
        currentItem.internalPath !== approvedItem.internalPath ||
        currentItem.archiveAdapter?.name !== approvedItem.archiveAdapter?.name ||
        currentItem.archiveAdapter?.version !== approvedItem.archiveAdapter?.version
      ) {
        return archiveMismatchError();
      }
    }
  }

  for (const currentItem of currentItems.values()) {
    if (!approvedItems.has(currentItem.key)) {
      return currentItem.kind === "archive-child" ? archiveMismatchError() : sourceChangedError();
    }
  }

  return { ok: true };
}

interface ScannedFile {
  readonly relativePath: string;
  readonly absolutePath: string;
}

function collectFiles(rootDir: string, currentDir = rootDir): ScannedFile[] {
  const files: ScannedFile[] = [];

  for (const entry of readdirSync(currentDir)) {
    const absolutePath = resolve(currentDir, entry);
    const stat = lstatSync(absolutePath);

    if (stat.isSymbolicLink()) {
      continue;
    }
    if (stat.isDirectory()) {
      files.push(...collectFiles(rootDir, absolutePath));
    } else if (stat.isFile()) {
      files.push({
        absolutePath,
        relativePath: relative(rootDir, absolutePath).split(sep).join("/")
      });
    }
  }

  return files;
}

function inventoryKeyForOccurrence(occurrence: IngestionOccurrenceSummary): string {
  return isArchiveOccurrence(occurrence)
    ? archiveInventoryKey(occurrence.containerPath, occurrence.internalPath)
    : regularInventoryKey(occurrence.sourcePath);
}

function regularInventoryKey(sourcePath: string): string {
  return JSON.stringify(["regular", sourcePath]);
}

function archiveInventoryKey(containerPath: string, internalPath: string): string {
  return JSON.stringify(["archive-child", containerPath, internalPath]);
}

function isLocalFilesystemOccurrence(occurrence: IngestionOccurrenceSummary): boolean {
  return occurrence.adapter?.name === localFilesystemAdapter.name &&
    occurrence.adapter.version === localFilesystemAdapter.version;
}

function isZipPath(relativePath: string): boolean {
  return relativePath.toLowerCase().endsWith(".zip");
}

function isArchiveOccurrence(
  occurrence: IngestionOccurrenceSummary
): occurrence is IngestionOccurrenceSummary & {
  containerPath: string;
  containerHash: `sha256:${string}`;
  internalPath: string;
  archiveAdapter: { name: string; version: string };
} {
  return (
    occurrence.containerPath !== undefined &&
    occurrence.containerHash !== undefined &&
    occurrence.internalPath !== undefined &&
    occurrence.archiveAdapter !== undefined
  );
}

function sha256(content: Buffer): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

function mediaTypeFor(sourcePath: string): string {
  const lowerPath = sourcePath.toLowerCase();

  if (lowerPath.endsWith(".txt")) {
    return "text/plain";
  }
  if (lowerPath.endsWith(".html") || lowerPath.endsWith(".htm")) {
    return "text/html";
  }
  if (lowerPath.endsWith(".json")) {
    return "application/json";
  }
  if (lowerPath.endsWith(".csv")) {
    return "text/csv";
  }
  if (lowerPath.endsWith(".pdf")) {
    return "application/pdf";
  }

  return "application/octet-stream";
}

function asContentHash(contentHash: string): `sha256:${string}` {
  return contentHash as `sha256:${string}`;
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sourceChangedError(): { readonly ok: false; readonly error: IngestionRuntimeError } {
  return stableIngestionError({
    code: "INGESTION_SOURCE_CHANGED_SINCE_APPROVAL",
    message: "Approved dry-run inventory no longer matches current source bytes.",
    allowedRepairActions: ["rerun dry-run scan", "review source changes", "approve a new import batch"],
    diagnostics: [{
      severity: "error",
      category: "ingestion.stale-source",
      message: "Current source bytes differ from the approved dry-run inventory."
    }]
  });
}

function archiveMismatchError(): { readonly ok: false; readonly error: IngestionRuntimeError } {
  return stableIngestionError({
    code: "INGESTION_ARCHIVE_CHILD_HASH_MISMATCH",
    message: "Approved archive inventory no longer matches current archive bytes.",
    allowedRepairActions: ["rerun dry-run scan", "review archive changes", "approve a new import batch"],
    diagnostics: [{
      severity: "error",
      category: "ingestion.archive-mismatch",
      message: "Current archive bytes differ from the approved dry-run inventory."
    }]
  });
}
