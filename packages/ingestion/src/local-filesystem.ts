import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
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
    const collected = this.collectFiles(rootDir);
    const files = collected.files.sort((left, right) => compareCodeUnits(left.relativePath, right.relativePath));
    const seenContentHashes = new Set<string>();
    const occurrences: LocalFilesystemOccurrence[] = [];
    const inventoryItems: InventoryItem[] = [];
    const diagnostics: LocalFilesystemDiagnostic[] = [];
    let observedByteTotal = 0;
    let uniqueByteTotal = 0;
    let skipped = collected.skipped;

    for (const file of files) {
      const bytes = readFileSync(file.absolutePath);
      const containerHash = sha256(bytes);

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
              occurrenceId: stableOccurrenceId(
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

      const stat = lstatSync(file.absolutePath);
      const contentHash = containerHash;
      const status: OccurrenceStatus = seenContentHashes.has(contentHash) ? "duplicate" : "new";

      if (status === "new") {
        seenContentHashes.add(contentHash);
        uniqueByteTotal += stat.size;
      }

      observedByteTotal += stat.size;

      const occurrence: LocalFilesystemOccurrence = {
        occurrenceId: stableOccurrenceId({
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
        sizeBytes: stat.size,
        status
      };

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

type OccurrenceIdMaterial = {
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

function stableOccurrenceId(material: OccurrenceIdMaterial): string {
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
