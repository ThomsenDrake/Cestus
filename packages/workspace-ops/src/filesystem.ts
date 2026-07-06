import {
  readdir,
  readFile,
  realpath as nodeRealpath,
  stat as nodeStat,
  statfs as nodeStatfs
} from "node:fs/promises";
import { join } from "node:path";

export interface WorkspaceStats {
  readonly kind: "file" | "directory" | "other";
  readonly sizeBytes: number;
}

export interface WorkspaceFileSystem {
  exists(path: string): Promise<boolean>;
  readText(path: string): Promise<string>;
  stat(path: string): Promise<WorkspaceStats>;
  list(path: string): Promise<readonly string[]>;
  realpath(path: string): Promise<string>;
  availableBytes(path: string): Promise<number | undefined>;
}

export class NodeWorkspaceFileSystem implements WorkspaceFileSystem {
  async exists(path: string): Promise<boolean> {
    try {
      await nodeStat(path);
      return true;
    } catch (error) {
      if (isMissingPathError(error)) {
        return false;
      }
      throw error;
    }
  }

  async readText(path: string): Promise<string> {
    return readFile(path, "utf8");
  }

  async stat(path: string): Promise<WorkspaceStats> {
    const stats = await nodeStat(path);
    return {
      kind: stats.isDirectory() ? "directory" : stats.isFile() ? "file" : "other",
      sizeBytes: stats.size
    };
  }

  async list(path: string): Promise<readonly string[]> {
    return readdir(path);
  }

  async realpath(path: string): Promise<string> {
    return nodeRealpath(path);
  }

  async availableBytes(path: string): Promise<number | undefined> {
    try {
      const stats = await nodeStatfs(path);
      return Number(stats.bavail) * Number(stats.bsize);
    } catch {
      return undefined;
    }
  }
}

export function childPath(parent: string, ...children: string[]): string {
  return join(parent, ...children);
}

function isMissingPathError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    ((error as { readonly code?: unknown }).code === "ENOENT" ||
      (error as { readonly code?: unknown }).code === "ENOTDIR")
  );
}
