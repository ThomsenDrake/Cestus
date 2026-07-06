import { closeSync, fstatSync, openSync, readSync } from "node:fs";
import { join, resolve } from "node:path";
import type { z } from "zod";
import { actorRefSchema } from "../../ontology/src/contracts.js";
import type { EventLedger } from "../../ontology/src/event-ledger.js";
import {
  LocalFilesystemScanner,
  type LocalFilesystemOccurrence,
  type LocalFilesystemScanResult
} from "./local-filesystem.js";
import type { LegacyDetection, LegacyDetectorInput, LegacyFileRef } from "./legacy-types.js";
import type { LegacyDetectorRegistry } from "./legacy-plugins.js";

type ActorRef = z.infer<typeof actorRefSchema>;

const previewByteLimit = 4096;

export interface LegacyCestusInspectorDependencies {
  ledger: EventLedger;
  actor: ActorRef;
  detectorRegistry: LegacyDetectorRegistry;
}

export interface LegacyInspectInput {
  sourceCollectionId: string;
  scanBatchId: string;
  rootDir: string;
}

export type LegacyInspectedFile = LegacyFileRef;

export interface LegacyDetectionRecord extends LegacyDetection {
  sourcePath: string;
  contentHash: `sha256:${string}`;
}

export interface LegacyReportInput {
  sourceCollectionId: string;
  scanBatchId: string;
  rootDir: string;
  scan: LocalFilesystemScanResult;
  files: LegacyInspectedFile[];
  detections: LegacyDetectionRecord[];
}

export class LegacyCestusInspector {
  constructor(private readonly dependencies: LegacyCestusInspectorDependencies) {
    const actor = actorRefSchema.safeParse(dependencies.actor);

    if (!actor.success) {
      throw new Error(`Invalid legacy inspector actor: ${actor.error.issues[0]?.message ?? actor.error.message}`);
    }
  }

  async inspect(input: LegacyInspectInput): Promise<LegacyReportInput> {
    const rootDir = resolve(input.rootDir);
    const scanner = new LocalFilesystemScanner({
      ledger: this.dependencies.ledger,
      actor: this.dependencies.actor
    });
    const scan = await scanner.scan({ ...input, rootDir });
    const files = scan.occurrences.map((occurrence) => this.inspectedFile(occurrence));
    const detections = scan.occurrences.flatMap((occurrence) => this.detectOccurrence(rootDir, occurrence));

    return {
      sourceCollectionId: input.sourceCollectionId,
      scanBatchId: input.scanBatchId,
      rootDir,
      scan,
      files,
      detections
    };
  }

  private inspectedFile(occurrence: LocalFilesystemOccurrence): LegacyInspectedFile {
    const sourcePath = occurrence.internalPath ?? occurrence.sourcePath;

    return {
      sourcePath,
      contentHash: occurrence.contentHash,
      sizeBytes: occurrence.sizeBytes,
      mediaType: mediaTypeForPath(sourcePath),
      sourceCollectionId: occurrence.sourceCollectionId,
      scanBatchId: occurrence.scanBatchId
    };
  }

  private detectOccurrence(rootDir: string, occurrence: LocalFilesystemOccurrence): LegacyDetectionRecord[] {
    if (occurrence.internalPath !== undefined) {
      return [];
    }

    const sourcePath = occurrence.sourcePath;
    const previewBytes = readPreviewBytes(join(rootDir, sourcePath));
    const detectorInput: LegacyDetectorInput = {
      sourcePath,
      sizeBytes: occurrence.sizeBytes,
      contentHash: occurrence.contentHash,
      mediaType: mediaTypeForPath(sourcePath),
      previewText: Buffer.from(previewBytes).toString("utf8"),
      previewBytes,
      sourceCollectionId: occurrence.sourceCollectionId,
      scanBatchId: occurrence.scanBatchId
    };

    return this.dependencies.detectorRegistry.detect(detectorInput).map((detection) => ({
      ...detection,
      sourcePath,
      contentHash: occurrence.contentHash
    }));
  }
}

function readPreviewBytes(path: string): Uint8Array {
  const fd = openSync(path, "r");

  try {
    const stat = fstatSync(fd);
    const buffer = Buffer.alloc(Math.min(stat.size, previewByteLimit));
    const bytesRead = readSync(fd, buffer, 0, buffer.byteLength, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    closeSync(fd);
  }
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
