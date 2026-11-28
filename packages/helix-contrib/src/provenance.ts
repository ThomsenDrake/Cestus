import { createHash } from "node:crypto";

export type ContentHash = `sha256:${string}`;

export interface ProvenanceRecord {
  readonly sourceId: string;
  readonly contentHash: ContentHash;
  readonly locator?: string;
  readonly authorityId: string;
}

const CONTENT_HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;

export class HelixProvenanceError extends Error {
  readonly code = "HELIX_PROVENANCE_INVALID";

  constructor(message: string) {
    super(message);
    this.name = "HelixProvenanceError";
  }
}

export function isValidContentHash(value: string): value is ContentHash {
  return CONTENT_HASH_PATTERN.test(value);
}

export function sha256ContentHash(input: string | Uint8Array): ContentHash {
  const hash = createHash("sha256");
  if (typeof input === "string") {
    hash.update(input, "utf8");
  } else {
    hash.update(input);
  }
  return `sha256:${hash.digest("hex")}`;
}

export function validateProvenanceRecord(record: ProvenanceRecord): ProvenanceRecord {
  if (typeof record.sourceId !== "string" || record.sourceId.trim().length === 0) {
    throw new HelixProvenanceError("Provenance sourceId must be a non-empty string.");
  }
  if (typeof record.contentHash !== "string" || !isValidContentHash(record.contentHash)) {
    throw new HelixProvenanceError(
      "Provenance contentHash must match sha256:<64 lowercase hex characters>."
    );
  }
  if (typeof record.authorityId !== "string" || record.authorityId.trim().length === 0) {
    throw new HelixProvenanceError("Provenance authorityId must be a non-empty string.");
  }
  if (record.locator !== undefined && (typeof record.locator !== "string" || record.locator.trim().length === 0)) {
    throw new HelixProvenanceError("Provenance locator, when provided, must be a non-empty string.");
  }
  return Object.freeze({
    sourceId: record.sourceId,
    contentHash: record.contentHash,
    authorityId: record.authorityId,
    ...(record.locator === undefined ? {} : { locator: record.locator })
  });
}

export function provenanceRecordsEqual(left: ProvenanceRecord, right: ProvenanceRecord): boolean {
  return (
    left.sourceId === right.sourceId &&
    left.contentHash === right.contentHash &&
    left.authorityId === right.authorityId &&
    (left.locator ?? undefined) === (right.locator ?? undefined)
  );
}
