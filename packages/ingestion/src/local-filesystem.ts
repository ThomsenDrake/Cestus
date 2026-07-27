import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync
} from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { z } from "zod";
import { actorRefSchema, type AppendableKnowledgeEvent } from "../../ontology/src/contracts.js";
import type { EventLedger } from "../../ontology/src/event-ledger.js";
import { ArchiveExpansionError, ZipArchiveAdapter } from "./archive-adapter.js";
import type { OccurrenceStatus } from "./types.js";

type ActorRef = z.infer<typeof actorRefSchema>;

const localFilesystemAdapter = { name: "local-filesystem", version: "0.1.0" } as const;
const defaultArchiveLimits = { maxEntries: 10000, maxExpandedBytes: 1024 * 1024 * 1024 };

export interface LocalFilesystemScannerDependencies {
  ledger: EventLedger;
  actor: ActorRef;
  archiveLimits?: {
    maxEntries: number;
    maxExpandedBytes: number;
  };
}

export interface LocalFilesystemScanInput {
  sourceCollectionId: string;
  scanBatchId: string;
  rootDir: string;
  /**
   * Exact immutable selection for metadata-first safety callers. When present,
   * directory enumeration is disabled and only these paths may be opened.
   */
  selectedFiles?: readonly LocalFilesystemSelectedFile[];
}

export interface LocalFilesystemSelectedFile {
  readonly occurrenceId: string;
  readonly sourcePath: string;
  readonly contentHash: `sha256:${string}`;
  readonly sizeBytes: number;
  readonly deviceId: string;
  readonly inode: string;
}

export interface LocalFilesystemOccurrence {
  occurrenceId: string;
  scanBatchId: string;
  sourceCollectionId: string;
  contentHash: `sha256:${string}`;
  sourcePath: string;
  sizeBytes: number;
  status: OccurrenceStatus;
  containerPath?: string;
  containerHash?: `sha256:${string}`;
  internalPath?: string;
  archiveAdapter?: { name: string; version: string };
}

export interface LocalFilesystemScanTotals {
  observedFiles: number;
  uniqueContent: number;
  duplicateOccurrences: number;
  skipped: number;
  bytes: number;
  estimatedNewBlobBytes: number;
}

export interface LocalFilesystemScanResult {
  scanBatchId: string;
  sourceCollectionId: string;
  rootDir: string;
  inventoryHash: `sha256:${string}`;
  totals: LocalFilesystemScanTotals;
  occurrences: LocalFilesystemOccurrence[];
  diagnostics: LocalFilesystemDiagnostic[];
}

export interface LocalFilesystemDiagnostic {
  category: "ingestion";
  message: string;
  sourcePath: string;
  repairHint: {
    contract: "ZipArchiveAdapter.expand";
    violatedPath: string;
    allowedActions: string[];
  };
}

interface ScannedFile {
  relativePath: string;
  absolutePath: string;
  selected?: ValidatedSelectedFile;
}

interface ValidatedSelectedFile extends LocalFilesystemSelectedFile {
  readonly absolutePath: string;
}

interface CollectedFiles {
  files: ScannedFile[];
  skipped: number;
}

interface InventoryItem {
  sourcePath: string;
  contentHash: `sha256:${string}`;
  sizeBytes: number;
  containerPath?: string;
  containerHash?: `sha256:${string}`;
  internalPath?: string;
  archiveAdapter?: { name: string; version: string };
}

export class LocalFilesystemScanner {
  private readonly zipArchiveAdapter = new ZipArchiveAdapter();

  constructor(private readonly dependencies: LocalFilesystemScannerDependencies) {}

  async scan(input: LocalFilesystemScanInput): Promise<LocalFilesystemScanResult> {
    const rootDir = resolve(input.rootDir);
    const streamId = this.streamId(input.scanBatchId);
    const selectedFiles = input.selectedFiles === undefined
      ? undefined
      : validateSelectedFiles(input, rootDir);
    const collected: CollectedFiles = selectedFiles === undefined
      ? this.collectFiles(rootDir)
      : {
          files: selectedFiles.map((selected) => ({
            relativePath: selected.sourcePath,
            absolutePath: selected.absolutePath,
            selected
          })),
          skipped: 0
        };
    const files = collected.files.sort((left, right) => compareCodeUnits(left.relativePath, right.relativePath));
    const seenContentHashes = new Set<string>();
    const occurrences: LocalFilesystemOccurrence[] = [];
    const inventoryItems: InventoryItem[] = [];
    const diagnostics: LocalFilesystemDiagnostic[] = [];
    let observedByteTotal = 0;
    let uniqueByteTotal = 0;
    let skipped = collected.skipped;

    for (const file of files) {
      const bytes = file.selected === undefined
        ? readFileSync(file.absolutePath)
        : readExactSelectedFile(file.selected);
      const containerHash = sha256(bytes);
      if (
        file.selected !== undefined
        && (
          containerHash !== file.selected.contentHash
          || bytes.byteLength !== file.selected.sizeBytes
        )
      ) {
        throw new Error(`Selected source changed before scan: ${file.relativePath}`);
      }

      if (isZipPath(file.relativePath)) {
        try {
          const children = this.zipArchiveAdapter.expand(bytes, {
            containerHash,
            ...this.archiveLimits()
          });

          for (const child of children) {
            const contentHash = sha256(child.content);
            const status: OccurrenceStatus = seenContentHashes.has(contentHash) ? "duplicate" : "new";

            if (status === "new") {
              seenContentHashes.add(contentHash);
              uniqueByteTotal += child.content.byteLength;
            }

            observedByteTotal += child.content.byteLength;

            const occurrence: LocalFilesystemOccurrence = {
              occurrenceId: stableLocalFilesystemOccurrenceId(
                {
                  kind: "archive-child",
                  sourceCollectionId: input.sourceCollectionId,
                  scanBatchId: input.scanBatchId,
                  sourcePath: file.relativePath,
                  containerPath: file.relativePath,
                  containerHash: child.containerHash,
                  internalPath: child.internalPath,
                  contentHash
                }
              ),
              scanBatchId: input.scanBatchId,
              sourceCollectionId: input.sourceCollectionId,
              contentHash,
              sourcePath: file.relativePath,
              sizeBytes: child.content.byteLength,
              status,
              containerPath: file.relativePath,
              containerHash: child.containerHash,
              internalPath: child.internalPath,
              archiveAdapter: { name: child.tool, version: child.version }
            };

            occurrences.push(occurrence);
            inventoryItems.push({
              sourcePath: occurrence.sourcePath,
              contentHash: occurrence.contentHash,
              sizeBytes: occurrence.sizeBytes,
              containerPath: file.relativePath,
              containerHash: child.containerHash,
              internalPath: child.internalPath,
              archiveAdapter: { name: child.tool, version: child.version }
            });
          }
        } catch (error) {
          diagnostics.push(archiveDiagnostic(file.relativePath, error));
          skipped += 1;
        }
        continue;
      }

      const sizeBytes = file.selected?.sizeBytes ?? lstatSync(file.absolutePath).size;
      const contentHash = containerHash;
      const status: OccurrenceStatus = seenContentHashes.has(contentHash) ? "duplicate" : "new";

      if (status === "new") {
        seenContentHashes.add(contentHash);
        uniqueByteTotal += sizeBytes;
      }

      observedByteTotal += sizeBytes;

      const occurrence: LocalFilesystemOccurrence = {
        occurrenceId: stableLocalFilesystemOccurrenceId({
          kind: "file",
          sourceCollectionId: input.sourceCollectionId,
          scanBatchId: input.scanBatchId,
          sourcePath: file.relativePath,
          contentHash
        }),
        scanBatchId: input.scanBatchId,
        sourceCollectionId: input.sourceCollectionId,
        contentHash,
        sourcePath: file.relativePath,
        sizeBytes,
        status
      };
      if (
        file.selected !== undefined
        && occurrence.occurrenceId !== file.selected.occurrenceId
      ) {
        throw new Error(`Selected occurrence identity mismatch: ${file.relativePath}`);
      }

      occurrences.push(occurrence);
      inventoryItems.push({
        sourcePath: occurrence.sourcePath,
        contentHash: occurrence.contentHash,
        sizeBytes: occurrence.sizeBytes
      });
    }

    const inventoryHash = inventoryDigest(inventoryItems);
    const totals = {
      observedFiles: occurrences.length,
      uniqueContent: seenContentHashes.size,
      duplicateOccurrences: occurrences.filter((occurrence) => occurrence.status === "duplicate").length,
      skipped,
      bytes: observedByteTotal,
      estimatedNewBlobBytes: uniqueByteTotal
    };

    await this.dependencies.ledger.append({
      type: "ingestion.scan.started",
      version: 1,
      streamId,
      context: this.context(input.scanBatchId),
      payload: {
        scanBatchId: input.scanBatchId,
        sourceCollectionId: input.sourceCollectionId,
        hashPolicy: "sha256-dry-run",
        startedAt: new Date().toISOString()
      }
    });

    for (const occurrence of occurrences) {
      await this.dependencies.ledger.append({
        type: "ingestion.occurrence.observed",
        version: 1,
        streamId,
        context: this.context(input.scanBatchId),
        payload: {
          ...occurrence,
          observedAt: new Date().toISOString(),
          adapter: localFilesystemAdapter
        }
      });
    }

    for (const diagnostic of diagnostics) {
      await this.dependencies.ledger.append({
        type: "diagnostic.recorded",
        version: 1,
        streamId,
        context: this.context(input.scanBatchId),
        payload: {
          diagnosticId: stableDiagnosticId(input.sourceCollectionId, input.scanBatchId, diagnostic),
          severity: "error",
          category: diagnostic.category,
          message: diagnostic.message,
          repairHint: diagnostic.repairHint
        }
      });
    }

    await this.dependencies.ledger.append({
      type: "ingestion.scan.completed",
      version: 1,
      streamId,
      context: this.context(input.scanBatchId),
      payload: {
        scanBatchId: input.scanBatchId,
        sourceCollectionId: input.sourceCollectionId,
        completedAt: new Date().toISOString(),
        inventoryHash,
        totals
      }
    });

    return {
      scanBatchId: input.scanBatchId,
      sourceCollectionId: input.sourceCollectionId,
      rootDir,
      inventoryHash,
      totals,
      occurrences,
      diagnostics
    };
  }

  private collectFiles(rootDir: string, currentDir = rootDir): CollectedFiles {
    const files: ScannedFile[] = [];
    let skipped = 0;

    for (const entry of readdirSync(currentDir)) {
      const absolutePath = resolve(currentDir, entry);
      const stat = lstatSync(absolutePath);

      if (stat.isSymbolicLink()) {
        skipped += 1;
      } else if (stat.isDirectory()) {
        const nested = this.collectFiles(rootDir, absolutePath);
        files.push(...nested.files);
        skipped += nested.skipped;
      } else if (stat.isFile()) {
        files.push({
          absolutePath,
          relativePath: relative(rootDir, absolutePath).split(sep).join("/")
        });
      } else {
        skipped += 1;
      }
    }

    return { files, skipped };
  }

  private context(scanBatchId: string): AppendableKnowledgeEvent["context"] {
    return {
      actor: this.dependencies.actor,
      occurredAt: new Date().toISOString(),
      correlationId: `corr_${scanBatchId}`,
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", ingestion: "0.1.0" }
    };
  }

  private streamId(scanBatchId: string): string {
    return `ingestion_scan_${scanBatchId}`;
  }

  private archiveLimits(): { maxEntries: number; maxExpandedBytes: number } {
    return this.dependencies.archiveLimits ?? defaultArchiveLimits;
  }
}

function isZipPath(relativePath: string): boolean {
  return relativePath.toLowerCase().endsWith(".zip");
}

function validateSelectedFiles(
  input: LocalFilesystemScanInput,
  rootDir: string
): readonly ValidatedSelectedFile[] {
  const selected = normalizeLocalFilesystemSelectedFiles(input.selectedFiles);

  const paths = new Set<string>();
  const occurrences = new Set<string>();
  return Object.freeze(selected.map((item) => {
    const normalized = item.sourcePath.normalize("NFC");
    const absolutePath = resolve(rootDir, normalized);
    const relativePath = relative(rootDir, absolutePath);
    if (
      normalized !== item.sourcePath
      || normalized.length === 0
      || isAbsolute(normalized)
      || normalized.startsWith("../")
      || normalized.includes("\\")
      || normalized.includes("\0")
      || relativePath !== normalized.split("/").join(sep)
      || isZipPath(normalized)
      || !/^occ_[a-zA-Z0-9_-]+$/.test(item.occurrenceId)
      || !/^sha256:[a-f0-9]{64}$/.test(item.contentHash)
      || !Number.isSafeInteger(item.sizeBytes)
      || item.sizeBytes < 0
      || typeof item.deviceId !== "string"
      || item.deviceId.length === 0
      || typeof item.inode !== "string"
      || item.inode.length === 0
      || paths.has(normalized)
      || occurrences.has(item.occurrenceId)
    ) {
      throw new Error("Selected filesystem scan entry is invalid or duplicated.");
    }
    paths.add(normalized);
    occurrences.add(item.occurrenceId);
    return Object.freeze({ ...item, sourcePath: normalized, absolutePath });
  }).sort((left, right) => compareCodeUnits(left.sourcePath, right.sourcePath)));
}

export function normalizeLocalFilesystemSelectedFiles(
  value: readonly LocalFilesystemSelectedFile[] | undefined
): readonly LocalFilesystemSelectedFile[] {
  if (
    value === undefined
    || !Array.isArray(value)
    || Object.getPrototypeOf(value) !== Array.prototype
  ) {
    throw new Error("Selected filesystem scan requires a non-empty plain array.");
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const length = Object.getOwnPropertyDescriptor(value, "length");
  const lengthValue = typeof length?.value === "number" ? length.value : -1;
  if (
    length === undefined
    || !Object.hasOwn(length, "value")
    || !Number.isSafeInteger(lengthValue)
    || lengthValue < 1
    || Reflect.ownKeys(value).length !== lengthValue + 1
  ) {
    throw new Error("Selected filesystem scan requires a dense own-data array.");
  }
  const selected: LocalFilesystemSelectedFile[] = [];
  for (let index = 0; index < lengthValue; index += 1) {
    const descriptor = descriptors[String(index)];
    if (
      descriptor === undefined
      || !descriptor.enumerable
      || !Object.hasOwn(descriptor, "value")
    ) {
      throw new Error("Selected filesystem scan requires a dense own-data array.");
    }
    selected.push(snapshotSelectedFile(descriptor.value as LocalFilesystemSelectedFile));
  }
  return Object.freeze(selected);
}

function snapshotSelectedFile(value: LocalFilesystemSelectedFile): LocalFilesystemSelectedFile {
  if (
    typeof value !== "object"
    || value === null
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error("Selected filesystem scan entry must be plain own data.");
  }
  const keys = ["occurrenceId", "sourcePath", "contentHash", "sizeBytes", "deviceId", "inode"] as const;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(value).length !== keys.length
    || keys.some((key) =>
      descriptors[key] === undefined
      || !Object.hasOwn(descriptors[key]!, "value")
    )
  ) {
    throw new Error("Selected filesystem scan entry must contain exact own-data fields.");
  }
  const snapshot = Object.fromEntries(keys.map((key) => [key, descriptors[key]!.value])) as unknown as LocalFilesystemSelectedFile;
  return Object.freeze(snapshot);
}

function readExactSelectedFile(selected: ValidatedSelectedFile): Buffer {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(
      selected.absolutePath,
      constants.O_RDONLY | constants.O_NOFOLLOW
    );
    const before = fstatSync(descriptor, { bigint: true });
    if (
      !before.isFile()
      || before.dev.toString() !== selected.deviceId
      || before.ino.toString() !== selected.inode
      || Number(before.size) !== selected.sizeBytes
    ) {
      throw new Error(`Selected source identity changed before scan: ${selected.sourcePath}`);
    }
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (
      after.dev !== before.dev
      || after.ino !== before.ino
      || after.size !== before.size
      || bytes.byteLength !== selected.sizeBytes
      || `sha256:${createHash("sha256").update(bytes).digest("hex")}` !== selected.contentHash
    ) {
      throw new Error(`Selected source identity changed during read: ${selected.sourcePath}`);
    }
    return bytes;
  } finally {
    if (descriptor !== undefined) {
      closeSync(descriptor);
    }
  }
}

export function readExactSelectedLocalFilesystemFile(
  rootDir: string,
  value: LocalFilesystemSelectedFile
): Buffer {
  const selected = snapshotSelectedFile(value);
  const normalizedRoot = resolve(rootDir);
  const absolutePath = resolve(normalizedRoot, selected.sourcePath);
  const relativePath = relative(normalizedRoot, absolutePath);
  if (
    selected.sourcePath.length === 0
    || selected.sourcePath !== selected.sourcePath.normalize("NFC")
    || isAbsolute(selected.sourcePath)
    || selected.sourcePath.startsWith("../")
    || selected.sourcePath.includes("\\")
    || selected.sourcePath.includes("\0")
    || relativePath !== selected.sourcePath.split("/").join(sep)
    || isZipPath(selected.sourcePath)
  ) {
    throw new Error("Selected filesystem read path is invalid.");
  }
  return readExactSelectedFile(Object.freeze({ ...selected, absolutePath }));
}

function archiveDiagnostic(sourcePath: string, error: unknown): LocalFilesystemDiagnostic {
  if (error instanceof ArchiveExpansionError) {
    const limitActions = ["reduce archive contents", "increase reviewed archive limits", "rerun dry-run"];
    return {
      category: "ingestion",
      message: error.message,
      sourcePath,
      repairHint: {
        contract: "ZipArchiveAdapter.expand",
        violatedPath: sourcePath,
        allowedActions: error.code === "unsafe-path"
          ? ["skip archive", "rebuild archive without unsafe paths", "rerun dry-run"]
          : limitActions
      }
    };
  }

  return {
    category: "ingestion",
    message: `zip archive expansion failed: ${errorMessage(error)}`,
    sourcePath,
    repairHint: {
      contract: "ZipArchiveAdapter.expand",
      violatedPath: sourcePath,
      allowedActions: ["inspect archive", "repair archive", "rerun dry-run"]
    }
  };
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export type StableLocalFilesystemOccurrenceIdInput = {
  kind: "file";
  sourceCollectionId: string;
  scanBatchId: string;
  sourcePath: string;
  contentHash: string;
} | {
  kind: "archive-child";
  sourceCollectionId: string;
  scanBatchId: string;
  sourcePath: string;
  containerPath: string;
  containerHash: string;
  internalPath: string;
  contentHash: string;
};

export function stableLocalFilesystemOccurrenceId(material: StableLocalFilesystemOccurrenceIdInput): string {
  return `occ_${createHash("sha256").update(JSON.stringify(material)).digest("hex")}`;
}

function sha256(bytes: Buffer): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function inventoryDigest(items: InventoryItem[]): `sha256:${string}` {
  return sha256(Buffer.from(JSON.stringify(items), "utf8"));
}

function stableDiagnosticId(
  sourceCollectionId: string,
  scanBatchId: string,
  diagnostic: LocalFilesystemDiagnostic
): string {
  return `diag_${createHash("sha256").update(JSON.stringify({
    sourceCollectionId,
    scanBatchId,
    sourcePath: diagnostic.sourcePath,
    message: diagnostic.message
  })).digest("hex")}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
