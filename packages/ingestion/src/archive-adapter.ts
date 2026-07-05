import { unzipSync } from "fflate";

const fflateAdapter = { name: "fflate", version: "0.8.3" } as const;

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
  version: "0.8.3";
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

    try {
      entries = unzipSync(content);
    } catch (error) {
      throw new ArchiveExpansionError(`zip archive expansion failed: ${errorMessage(error)}`, "invalid-archive");
    }

    const internalPaths = Object.keys(entries)
      .filter((internalPath) => !internalPath.endsWith("/"))
      .sort(compareCodeUnits);

    if (internalPaths.length > options.maxEntries) {
      throw new ArchiveExpansionError("archive entry count limit exceeded", "entry-count-limit");
    }

    const children: ZipArchiveChild[] = [];
    let expandedBytes = 0;

    for (const internalPath of internalPaths) {
      assertSafeInternalPath(internalPath);
      const entryContent = entries[internalPath];
      if (entryContent === undefined) {
        continue;
      }
      expandedBytes += entryContent.byteLength;
      if (expandedBytes > options.maxExpandedBytes) {
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

function assertSafeInternalPath(internalPath: string): void {
  const segments = internalPath.split("/");
  if (
    internalPath.startsWith("/") ||
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
