import { unzipSync, type UnzipFileInfo } from "fflate";

const fflateAdapter = { name: "fflate", version: "0.8.x" } as const;

export interface ZipArchiveExpandOptions {
  containerHash: `sha256:${string}`;
  maxEntries: number;
  maxExpandedBytes: number;
}

export interface ZipArchiveChild {
  internalPath: string;
  content: Buffer;
  containerHash: `sha256:${string}`;
  tool: "fflate";
  version: "0.8.x";
}

export class ArchiveExpansionError extends Error {
  constructor(
    message: string,
    readonly code: "unsafe-path" | "entry-count-limit" | "expanded-byte-limit" | "invalid-archive"
  ) {
    super(message);
    this.name = "ArchiveExpansionError";
  }
}

export class ZipArchiveAdapter {
  expand(content: Buffer | Uint8Array, options: ZipArchiveExpandOptions): ZipArchiveChild[] {
    let entries: Record<string, Uint8Array>;
    let entryCount = 0;
    let expandedBytes = 0;

    try {
      entries = unzipSync(content, {
        filter: (file) => {
          validateEntryMetadata(file, options, {
            entryCount,
            expandedBytes,
            recordEntry: () => {
              entryCount += 1;
            },
            recordExpandedBytes: (bytes) => {
              expandedBytes += bytes;
            }
          });
          return !file.name.endsWith("/");
        }
      });
    } catch (error) {
      if (error instanceof ArchiveExpansionError) {
        throw error;
      }
      throw new ArchiveExpansionError(`zip archive expansion failed: ${errorMessage(error)}`, "invalid-archive");
    }

    const internalPaths = Object.keys(entries)
      .filter((internalPath) => !internalPath.endsWith("/"))
      .sort(compareCodeUnits);

    const children: ZipArchiveChild[] = [];
    let verifiedExpandedBytes = 0;

    for (const internalPath of internalPaths) {
      assertSafeInternalPath(internalPath);
      const entryContent = entries[internalPath];
      if (entryContent === undefined) {
        continue;
      }
      verifiedExpandedBytes += entryContent.byteLength;
      if (verifiedExpandedBytes > options.maxExpandedBytes) {
        throw new ArchiveExpansionError("archive expansion byte limit exceeded", "expanded-byte-limit");
      }
      children.push({
        internalPath,
        content: Buffer.from(entryContent),
        containerHash: options.containerHash,
        tool: fflateAdapter.name,
        version: fflateAdapter.version
      });
    }

    return children;
  }
}

export const zipArchiveAdapterRef = fflateAdapter;

interface ZipMetadataAccumulator {
  entryCount: number;
  expandedBytes: number;
  recordEntry: () => void;
  recordExpandedBytes: (bytes: number) => void;
}

function validateEntryMetadata(
  file: UnzipFileInfo,
  options: ZipArchiveExpandOptions,
  accumulator: ZipMetadataAccumulator
): void {
  assertSafeInternalPath(file.name);

  if (file.name.endsWith("/")) {
    return;
  }

  if (accumulator.entryCount + 1 > options.maxEntries) {
    throw new ArchiveExpansionError("archive entry count limit exceeded", "entry-count-limit");
  }

  if (accumulator.expandedBytes + file.originalSize > options.maxExpandedBytes) {
    throw new ArchiveExpansionError("archive expansion byte limit exceeded", "expanded-byte-limit");
  }

  accumulator.recordEntry();
  accumulator.recordExpandedBytes(file.originalSize);
}

function assertSafeInternalPath(internalPath: string): void {
  const segments = internalPath.split("/");
  if (
    internalPath.startsWith("/") ||
    /^[A-Za-z]:\//.test(internalPath) ||
    internalPath.includes("\\") ||
    segments.some((segment) => segment === "..")
  ) {
    throw new ArchiveExpansionError(`unsafe archive path: ${internalPath}`, "unsafe-path");
  }
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
