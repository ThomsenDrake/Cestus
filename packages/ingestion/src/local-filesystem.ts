import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import type { z } from "zod";
import { actorRefSchema, type AppendableKnowledgeEvent } from "../../ontology/src/contracts.js";
import type { EventLedger } from "../../ontology/src/event-ledger.js";
import type { OccurrenceStatus } from "./types.js";

type ActorRef = z.infer<typeof actorRefSchema>;

const localFilesystemAdapter = { name: "local-filesystem", version: "0.1.0" } as const;

export interface LocalFilesystemScannerDependencies {
  ledger: EventLedger;
  actor: ActorRef;
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
}

interface ScannedFile {
  relativePath: string;
  absolutePath: string;
}

export class LocalFilesystemScanner {
  constructor(private readonly dependencies: LocalFilesystemScannerDependencies) {}

  async scan(input: LocalFilesystemScanInput): Promise<LocalFilesystemScanResult> {
    const rootDir = resolve(input.rootDir);
    const streamId = this.streamId(input.scanBatchId);

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

    const files = this.collectFiles(rootDir).sort((left, right) => left.relativePath.localeCompare(right.relativePath));
    const seenContentHashes = new Set<string>();
    const occurrences: LocalFilesystemOccurrence[] = [];
    let observedByteTotal = 0;
    let uniqueByteTotal = 0;

    for (const file of files) {
      const stat = statSync(file.absolutePath);
      const bytes = readFileSync(file.absolutePath);
      const contentHash = sha256(bytes);
      const status: OccurrenceStatus = seenContentHashes.has(contentHash) ? "duplicate" : "new";

      if (status === "new") {
        seenContentHashes.add(contentHash);
        uniqueByteTotal += stat.size;
      }

      observedByteTotal += stat.size;

      const occurrence: LocalFilesystemOccurrence = {
        occurrenceId: stableOccurrenceId(input.scanBatchId, file.relativePath, contentHash),
        scanBatchId: input.scanBatchId,
        sourceCollectionId: input.sourceCollectionId,
        contentHash,
        sourcePath: file.relativePath,
        sizeBytes: stat.size,
        status
      };

      occurrences.push(occurrence);

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

    const inventoryHash = inventoryDigest(occurrences);
    const totals = {
      observedFiles: occurrences.length,
      uniqueContent: seenContentHashes.size,
      duplicateOccurrences: occurrences.filter((occurrence) => occurrence.status === "duplicate").length,
      skipped: 0,
      bytes: observedByteTotal,
      estimatedNewBlobBytes: uniqueByteTotal
    };

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
      occurrences
    };
  }

  private collectFiles(rootDir: string, currentDir = rootDir): ScannedFile[] {
    const files: ScannedFile[] = [];

    for (const entry of readdirSync(currentDir)) {
      const absolutePath = resolve(currentDir, entry);
      const stat = statSync(absolutePath);

      if (stat.isDirectory()) {
        files.push(...this.collectFiles(rootDir, absolutePath));
      } else if (stat.isFile()) {
        files.push({
          absolutePath,
          relativePath: relative(rootDir, absolutePath).split(sep).join("/")
        });
      }
    }

    return files;
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
}

function stableOccurrenceId(scanBatchId: string, relativePath: string, contentHash: string): string {
  return `occ_${createHash("sha256").update(`${scanBatchId}:${relativePath}:${contentHash}`).digest("hex")}`;
}

function sha256(bytes: Buffer): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function inventoryDigest(occurrences: LocalFilesystemOccurrence[]): `sha256:${string}` {
  return sha256(Buffer.from(JSON.stringify(occurrences), "utf8"));
}
