import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const contentHashPattern = /^sha256:[a-f0-9]{64}$/;

export interface StoredBlob {
  contentHash: `sha256:${string}`;
  sizeBytes: number;
  path: string;
}

export class FileBlobStore {
  constructor(private readonly rootDir: string) {}

  async put(content: Buffer): Promise<StoredBlob> {
    const digest = createHash("sha256").update(content).digest("hex");
    const contentHash = `sha256:${digest}` as const;
    const dir = join(this.rootDir, "sha256", digest.slice(0, 2));
    const path = join(dir, digest);
    mkdirSync(dir, { recursive: true });

    try {
      writeFileSync(path, content, { flag: "wx" });
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code !== "EEXIST") {
        throw error;
      }
    }

    return { contentHash, sizeBytes: content.byteLength, path };
  }

  async get(contentHash: `sha256:${string}`): Promise<Buffer> {
    if (!contentHashPattern.test(contentHash)) {
      throw new Error("Invalid blob content hash");
    }

    const digest = contentHash.replace("sha256:", "");
    const path = join(this.rootDir, "sha256", digest.slice(0, 2), digest);
    const content = readFileSync(path);
    const actual = createHash("sha256").update(content).digest("hex");

    if (actual !== digest) {
      throw new Error(`Blob hash mismatch for ${contentHash}`);
    }

    return content;
  }
}
