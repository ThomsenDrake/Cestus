export type IngestionJobState = "queued" | "running" | "succeeded" | "failed" | "skipped";
export type IngestionMode = "read-only";
export type OccurrenceStatus = "new" | "duplicate" | "changed" | "missing" | "skipped";
export type ParseLane = "local" | "provider";

export interface IngestionAdapterRef {
  name: string;
  version: string;
}

export interface SourceCollectionRef {
  sourceCollectionId: string;
  label: string;
}

export interface ContentOccurrenceRef {
  occurrenceId: string;
  sourceCollectionId: string;
  scanBatchId: string;
  contentHash: `sha256:${string}`;
}
