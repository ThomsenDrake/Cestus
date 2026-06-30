import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileBlobStore } from "../src/blob-store.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cestus-blobs-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("FileBlobStore", () => {
  it("stores content by sha256 and reads it back", async () => {
    const store = new FileBlobStore(dir);
    const saved = await store.put(Buffer.from("public record"));
    const loaded = await store.get(saved.contentHash);

    expect(saved.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(saved.sizeBytes).toBe(13);
    expect(loaded.toString("utf8")).toBe("public record");
  });

  it("deduplicates identical content", async () => {
    const store = new FileBlobStore(dir);
    const first = await store.put(Buffer.from("same"));
    const second = await store.put(Buffer.from("same"));

    expect(second.contentHash).toBe(first.contentHash);
    expect(second.path).toBe(first.path);
  });

  it("rejects corrupted content on readback", async () => {
    const store = new FileBlobStore(dir);
    const saved = await store.put(Buffer.from("verified public record"));
    writeFileSync(saved.path, Buffer.from("tampered public record"));

    await expect(store.get(saved.contentHash)).rejects.toThrow(/hash mismatch/i);
  });
});
