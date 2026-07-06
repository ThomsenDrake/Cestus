import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { ZipArchiveAdapter, type ZipArchiveChild } from "./archive-adapter.js";
import type { IngestionOccurrenceSummary } from "./projection.js";
import {
  stableIngestionError,
  type IngestionRuntimeError
} from "./runtime-types.js";

const archiveLimits = {
  maxEntries: 10000,
  maxExpandedBytes: 1024 * 1024 * 1024
};

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

type MaterializedOccurrenceResult =
  | { readonly ok: true; readonly occurrence: MaterializedImportOccurrence }
  | { readonly ok: false; readonly error: IngestionRuntimeError };

export function materializeApprovedOccurrences(
  input: MaterializeApprovedOccurrencesInput
): MaterializeApprovedOccurrencesResult {
  const sourceRoot = resolve(input.sourceRoot);
  const archiveAdapter = new ZipArchiveAdapter();
  const expandedArchives = new Map<string, ExpandedArchive>();
  const materialized: MaterializedImportOccurrence[] = [];

  for (const occurrence of input.occurrences) {
    const result = isArchiveOccurrence(occurrence)
      ? materializeArchiveOccurrence(sourceRoot, occurrence, archiveAdapter, expandedArchives)
      : materializeRegularOccurrence(sourceRoot, occurrence);

    if (!result.ok) {
      return result;
    }

    materialized.push(result.occurrence);
  }

  return { ok: true, occurrences: materialized };
}

function materializeRegularOccurrence(
  sourceRoot: string,
  occurrence: IngestionOccurrenceSummary
): MaterializedOccurrenceResult {
  const current = readSourceFile(sourceRoot, occurrence.sourcePath);

  if (current === undefined) {
    return sourceChangedError();
  }

  if (sha256(current) !== occurrence.contentHash || current.byteLength !== occurrence.sizeBytes) {
    return sourceChangedError();
  }

  return {
    ok: true,
    occurrence: {
      occurrenceId: occurrence.occurrenceId,
      content: current,
      sourcePath: occurrence.sourcePath,
      mediaType: mediaTypeFor(occurrence.sourcePath)
    }
  };
}

function materializeArchiveOccurrence(
  sourceRoot: string,
  occurrence: IngestionOccurrenceSummary & {
    containerPath: string;
    containerHash: `sha256:${string}`;
    internalPath: string;
    archiveAdapter: { name: string; version: string };
  },
  archiveAdapter: ZipArchiveAdapter,
  expandedArchives: Map<string, ExpandedArchive>
): MaterializedOccurrenceResult {
  const archive = expandedArchiveFor(sourceRoot, occurrence, archiveAdapter, expandedArchives);

  if (!archive.ok) {
    return archive;
  }

  if (archive.archive.containerHash !== occurrence.containerHash) {
    return archiveMismatchError();
  }

  const child = archive.archive.children.find((entry) => entry.internalPath === occurrence.internalPath);

  if (child === undefined) {
    return archiveMismatchError();
  }

  if (
    child.containerHash !== occurrence.containerHash ||
    sha256(child.content) !== occurrence.contentHash ||
    child.content.byteLength !== occurrence.sizeBytes ||
    child.tool !== occurrence.archiveAdapter.name ||
    child.version !== occurrence.archiveAdapter.version
  ) {
    return archiveMismatchError();
  }

  return {
    ok: true,
    occurrence: {
      occurrenceId: occurrence.occurrenceId,
      content: child.content,
      sourcePath: `${occurrence.containerPath}!/${occurrence.internalPath}`,
      mediaType: mediaTypeFor(occurrence.internalPath)
    }
  };
}

function expandedArchiveFor(
  sourceRoot: string,
  occurrence: IngestionOccurrenceSummary & {
    containerPath: string;
    containerHash: `sha256:${string}`;
  },
  archiveAdapter: ZipArchiveAdapter,
  expandedArchives: Map<string, ExpandedArchive>
): { readonly ok: true; readonly archive: ExpandedArchive } | { readonly ok: false; readonly error: IngestionRuntimeError } {
  const existing = expandedArchives.get(occurrence.containerPath);
  if (existing !== undefined) {
    return { ok: true, archive: existing };
  }

  const container = readSourceFile(sourceRoot, occurrence.containerPath);

  if (container === undefined) {
    return archiveMismatchError();
  }

  const containerHash = sha256(container);

  try {
    const archive = {
      containerHash,
      children: archiveAdapter.expand(container, {
        containerHash,
        ...archiveLimits
      })
    };
    expandedArchives.set(occurrence.containerPath, archive);
    return { ok: true, archive };
  } catch {
    return archiveMismatchError();
  }
}

function readSourceFile(sourceRoot: string, sourcePath: string): Buffer | undefined {
  const resolvedPath = resolve(sourceRoot, sourcePath);

  if (!isPathInside(sourceRoot, resolvedPath)) {
    return undefined;
  }

  try {
    return readFileSync(resolvedPath);
  } catch {
    return undefined;
  }
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

function isPathInside(root: string, filePath: string): boolean {
  const relativePath = relative(root, filePath);
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
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
