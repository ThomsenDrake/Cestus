import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
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
    const digest = saved.contentHash.replace("sha256:", "");
    expect(relative(dir, saved.path)).toBe(join("sha256", digest.slice(0, 2), digest));
    expect(loaded.toString("utf8")).toBe("public record");
  });

  it("deduplicates identical content", async () => {
    const store = new FileBlobStore(dir);
    const first = await store.put(Buffer.from("same"));
    const second = await store.put(Buffer.from("same"));

    expect(second.contentHash).toBe(first.contentHash);
    expect(second.path).toBe(first.path);
  });

  it("rejects an existing blob path when the stored bytes do not match the requested hash", async () => {
    const store = new FileBlobStore(dir);
    const content = Buffer.from("verified body");
    const digest = createHash("sha256").update(content).digest("hex");
    const existingDir = join(dir, "sha256", digest.slice(0, 2));
    mkdirSync(existingDir, { recursive: true });
    writeFileSync(join(existingDir, digest), Buffer.from("corrupt body"));

    await expect(store.put(content)).rejects.toThrow(/hash mismatch/i);
  });

  it("rejects corrupted content on readback", async () => {
    const store = new FileBlobStore(dir);
    const saved = await store.put(Buffer.from("verified public record"));
    writeFileSync(saved.path, Buffer.from("tampered public record"));

    await expect(store.get(saved.contentHash)).rejects.toThrow(/hash mismatch/i);
  });

  it.each([
    ["wrong prefix", "sha-256:9f2c8b7a5f4e3d2c1b0a99887766554433221100ffeeddccbbaa998877665544"],
    ["short hash", "sha256:9f2c8b7a"],
    ["uppercase hash", "sha256:9F2C8B7A5F4E3D2C1B0A99887766554433221100FFEEDDCCBBAA998877665544"],
    ["non-hex hash", "sha256:zf2c8b7a5f4e3d2c1b0a99887766554433221100ffeeddccbbaa998877665544"],
    ["traversal-shaped hash", "sha256:../../../../etc/passwd"]
  ])("rejects malformed content hash with %s", async (_label, contentHash) => {
    const store = new FileBlobStore(dir);

    await expect(store.get(contentHash as `sha256:${string}`)).rejects.toThrow("Invalid blob content hash");
  });
});
