import { EndpointAllowlist, type EndpointAllowlistRule } from "./allowlist.js";
import type {
  HelixGraphTransport,
  HelixHealthStatus,
  StoredHelixEdge,
  StoredHelixNode
} from "./client.js";
import {
  provenanceRecordsEqual,
  sha256ContentHash,
  validateProvenanceRecord,
  type ContentHash,
  type ProvenanceRecord
} from "./provenance.js";
import {
  prepareTextSpanNode,
  type ScalarPropertyValue,
  type TextSpanNodeInput
} from "./text-span.js";

export const PROVENANCE_PROPERTY_KEYS = Object.freeze([
  "_db",
  "stableKey",
  "sourceId",
  "contentHash",
  "authorityId",
  "locator"
] as const);

export const WATERMARK_NODE_LABEL = "_AppendOnlyWatermark";

export class HelixAppendOnlyError extends Error {
  readonly code = "HELIX_APPEND_ONLY_VIOLATION";

  constructor(message: string) {
    super(message);
    this.name = "HelixAppendOnlyError";
  }
}

export interface AppendNodeInput {
  readonly label: string;
  readonly stableKey: string;
  readonly provenance: ProvenanceRecord;
  readonly properties?: Readonly<Record<string, ScalarPropertyValue>>;
}

export interface AppendEdgeInput {
  readonly edgeLabel: string;
  readonly stableKey: string;
  readonly from: {
    readonly label: string;
    readonly stableKey: string;
  };
  readonly to: {
    readonly label: string;
    readonly stableKey: string;
  };
  readonly provenance: ProvenanceRecord;
  readonly properties?: Readonly<Record<string, ScalarPropertyValue>>;
}

export type ReplayLogEntry =
  | ({ readonly kind: "node" } & AppendNodeInput)
  | ({ readonly kind: "text-span" } & TextSpanNodeInput)
  | ({ readonly kind: "edge" } & AppendEdgeInput);

export interface AppendWriteResult<T> {
  readonly inserted: boolean;
  readonly record: T;
}

export interface WatermarkRecordInput {
  readonly revision: number;
  readonly lastAuthorityId: string;
  readonly logDigest: ContentHash;
  readonly provenance: ProvenanceRecord;
}

export interface StoredWatermarkRecord {
  readonly revision: number;
  readonly lastAuthorityId: string;
  readonly logDigest: ContentHash;
  readonly stableKey: string;
}

export interface RebuildFingerprint {
  readonly databaseName: string;
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly nodeCountsByLabel: Readonly<Record<string, number>>;
  readonly edgeCountsByLabel: Readonly<Record<string, number>>;
  readonly provenanceDigest: ContentHash;
  readonly sourceIds: readonly string[];
  readonly contentHashes: readonly ContentHash[];
  readonly authorityIds: readonly string[];
}

export interface AppendOnlyHelixWriterOptions {
  readonly transport: HelixGraphTransport;
  readonly databaseName: string;
  readonly allowlist: EndpointAllowlist | readonly EndpointAllowlistRule[];
}

export class AppendOnlyHelixWriter {
  readonly databaseName: string;
  readonly endpoint: string;
  private readonly transport: HelixGraphTransport;
  private readonly allowlist: EndpointAllowlist;

  constructor(options: AppendOnlyHelixWriterOptions) {
    if (options.databaseName.trim().length === 0) {
      throw new HelixAppendOnlyError("databaseName must be a non-empty string.");
    }
    this.databaseName = options.databaseName;
    this.transport = options.transport;
    this.endpoint = options.transport.endpoint;
    this.allowlist =
      options.allowlist instanceof EndpointAllowlist
        ? options.allowlist
        : new EndpointAllowlist(options.allowlist);
  }

  healthCheck(): Promise<HelixHealthStatus> {
    return this.transport.healthCheck();
  }

  async appendNode(input: AppendNodeInput): Promise<AppendWriteResult<StoredHelixNode>> {
    this.transport.assertWritePreconditions();
    assertNonEmpty("label", input.label);
    assertNonEmpty("stableKey", input.stableKey);
    if (input.label === WATERMARK_NODE_LABEL) {
      throw new HelixAppendOnlyError("Use appendWatermark() for watermark records.");
    }
    const provenance = validateProvenanceRecord(input.provenance);
    const existing = await this.transport.findNode(this.databaseName, input.label, input.stableKey);
    if (existing !== undefined) {
      const existingProvenance = extractProvenance(existing.properties);
      if (existingProvenance === undefined || !provenanceRecordsEqual(existingProvenance, provenance)) {
        throw new HelixAppendOnlyError(
          `Refusing to overwrite recorded node (${input.label}:${input.stableKey}) with conflicting provenance.`
        );
      }
      return Object.freeze({ inserted: false, record: existing });
    }
    const properties = buildElementProperties(provenance, input.properties);
    const inserted = await this.transport.insertNode(
      this.databaseName,
      input.label,
      input.stableKey,
      properties
    );
    return Object.freeze({ inserted: true, record: inserted });
  }

  async appendTextSpan(input: TextSpanNodeInput): Promise<AppendWriteResult<StoredHelixNode>> {
    const prepared = prepareTextSpanNode(input);
    return this.appendNode({
      label: prepared.label,
      stableKey: prepared.stableKey,
      provenance: prepared.provenance,
      properties: prepared.properties
    });
  }

  async appendEdge(input: AppendEdgeInput): Promise<AppendWriteResult<StoredHelixEdge>> {
    this.transport.assertWritePreconditions();
    assertNonEmpty("edgeLabel", input.edgeLabel);
    assertNonEmpty("stableKey", input.stableKey);
    assertNonEmpty("from.label", input.from.label);
    assertNonEmpty("from.stableKey", input.from.stableKey);
    assertNonEmpty("to.label", input.to.label);
    assertNonEmpty("to.stableKey", input.to.stableKey);

    this.allowlist.assertAllowed(input.from.label, input.edgeLabel, input.to.label);
    const provenance = validateProvenanceRecord(input.provenance);

    const existing = await this.transport.findEdge(this.databaseName, input.edgeLabel, input.stableKey);
    if (existing !== undefined) {
      const existingProvenance = extractProvenance(existing.properties);
      if (
        existingProvenance === undefined ||
        !provenanceRecordsEqual(existingProvenance, provenance) ||
        (existing.fromStableKey !== undefined && existing.fromStableKey !== input.from.stableKey) ||
        (existing.toStableKey !== undefined && existing.toStableKey !== input.to.stableKey)
      ) {
        throw new HelixAppendOnlyError(
          `Refusing to overwrite recorded edge (${input.edgeLabel}:${input.stableKey}) with conflicting provenance or endpoints.`
        );
      }
      return Object.freeze({ inserted: false, record: existing });
    }

    const properties = buildElementProperties(provenance, input.properties);
    const inserted = await this.transport.insertEdge({
      databaseName: this.databaseName,
      fromLabel: input.from.label,
      fromStableKey: input.from.stableKey,
      edgeLabel: input.edgeLabel,
      stableKey: input.stableKey,
      toLabel: input.to.label,
      toStableKey: input.to.stableKey,
      properties
    });
    return Object.freeze({ inserted: true, record: inserted });
  }

  async appendWatermark(input: WatermarkRecordInput): Promise<AppendWriteResult<StoredWatermarkRecord>> {
    this.transport.assertWritePreconditions();
    if (!Number.isSafeInteger(input.revision) || input.revision < 0) {
      throw new HelixAppendOnlyError("Watermark revision must be a non-negative safe integer.");
    }
    const provenance = validateProvenanceRecord(input.provenance);
    const stableKey = `watermark:${input.revision}:${input.lastAuthorityId}:${input.logDigest}`;
    const existing = await this.transport.findNode(this.databaseName, WATERMARK_NODE_LABEL, stableKey);
    if (existing !== undefined) {
      return Object.freeze({
        inserted: false,
        record: Object.freeze({
          revision: input.revision,
          lastAuthorityId: input.lastAuthorityId,
          logDigest: input.logDigest,
          stableKey
        })
      });
    }
    const properties = buildElementProperties(provenance, {
      revision: input.revision,
      lastAuthorityId: input.lastAuthorityId,
      logDigest: input.logDigest
    });
    await this.transport.insertNode(this.databaseName, WATERMARK_NODE_LABEL, stableKey, properties);
    return Object.freeze({
      inserted: true,
      record: Object.freeze({
        revision: input.revision,
        lastAuthorityId: input.lastAuthorityId,
        logDigest: input.logDigest,
        stableKey
      })
    });
  }

  async readLatestWatermark(): Promise<StoredWatermarkRecord | undefined> {
    const nodes = await this.transport.findNodesByLabel(this.databaseName, WATERMARK_NODE_LABEL);
    let latest: StoredWatermarkRecord | undefined;
    for (const node of nodes) {
      const revision = node.properties.revision;
      const lastAuthorityId = node.properties.lastAuthorityId;
      const logDigest = node.properties.logDigest;
      if (
        typeof revision !== "number" ||
        typeof lastAuthorityId !== "string" ||
        typeof logDigest !== "string" ||
        !logDigest.startsWith("sha256:")
      ) {
        continue;
      }
      if (latest === undefined || revision > latest.revision) {
        latest = Object.freeze({
          revision,
          lastAuthorityId,
          logDigest: logDigest as ContentHash,
          stableKey: node.stableKey
        });
      }
    }
    return latest;
  }

  drop(_label?: string, _stableKey?: string): never {
    throw new HelixAppendOnlyError(
      "Append-only writer forbids drop() on recorded elements; use explicit rebuild(databaseName, entries) instead."
    );
  }

  setProperty(_label: string, _stableKey: string, property: string, _value: ScalarPropertyValue): never {
    throw new HelixAppendOnlyError(
      `Append-only writer forbids setProperty("${property}") on recorded elements; append a new authority-bearing element instead.`
    );
  }

  removeProperty(_label: string, _stableKey: string, property: string): never {
    throw new HelixAppendOnlyError(
      `Append-only writer forbids removeProperty("${property}") on recorded elements.`
    );
  }

  async rebuild(
    targetDatabaseName: string,
    entries: readonly ReplayLogEntry[],
    watermark?: WatermarkRecordInput
  ): Promise<RebuildFingerprint> {
    this.transport.assertWritePreconditions();
    if (targetDatabaseName !== this.databaseName) {
      throw new HelixAppendOnlyError(
        `Rebuild target "${targetDatabaseName}" does not match configured database "${this.databaseName}".`
      );
    }
    await this.transport.dropDatabase(targetDatabaseName);

    const nodeCounts: Record<string, number> = {};
    const edgeCounts: Record<string, number> = {};
    const fingerprintRecords: string[] = [];
    const sourceIdSet = new Set<string>();
    const contentHashSet = new Set<ContentHash>();
    const authorityIdSet = new Set<string>();
    let totalNodes = 0;
    let totalEdges = 0;

    for (const entry of entries) {
      if (entry.kind === "node") {
        const result = await this.appendNode(entry);
        if (result.inserted) {
          totalNodes += 1;
          nodeCounts[entry.label] = (nodeCounts[entry.label] ?? 0) + 1;
          recordProvenanceLine(
            fingerprintRecords,
            sourceIdSet,
            contentHashSet,
            authorityIdSet,
            "node",
            entry.label,
            entry.stableKey,
            entry.provenance
          );
        }
      } else if (entry.kind === "text-span") {
        const prepared = prepareTextSpanNode(entry);
        const result = await this.appendTextSpan(entry);
        if (result.inserted) {
          totalNodes += 1;
          nodeCounts[prepared.label] = (nodeCounts[prepared.label] ?? 0) + 1;
          recordProvenanceLine(
            fingerprintRecords,
            sourceIdSet,
            contentHashSet,
            authorityIdSet,
            "node",
            prepared.label,
            prepared.stableKey,
            prepared.provenance
          );
        }
      } else {
        const result = await this.appendEdge(entry);
        if (result.inserted) {
          totalEdges += 1;
          edgeCounts[entry.edgeLabel] = (edgeCounts[entry.edgeLabel] ?? 0) + 1;
          recordProvenanceLine(
            fingerprintRecords,
            sourceIdSet,
            contentHashSet,
            authorityIdSet,
            "edge",
            entry.edgeLabel,
            entry.stableKey,
            entry.provenance
          );
        }
      }
    }

    if (watermark !== undefined) {
      await this.appendWatermark(watermark);
    }

    fingerprintRecords.sort((a, b) => a.localeCompare(b));
    const sortedNodeCounts: Record<string, number> = {};
    for (const key of Object.keys(nodeCounts).sort((a, b) => a.localeCompare(b))) {
      sortedNodeCounts[key] = nodeCounts[key]!;
    }
    const sortedEdgeCounts: Record<string, number> = {};
    for (const key of Object.keys(edgeCounts).sort((a, b) => a.localeCompare(b))) {
      sortedEdgeCounts[key] = edgeCounts[key]!;
    }

    return Object.freeze({
      databaseName: this.databaseName,
      nodeCount: totalNodes,
      edgeCount: totalEdges,
      nodeCountsByLabel: Object.freeze(sortedNodeCounts),
      edgeCountsByLabel: Object.freeze(sortedEdgeCounts),
      provenanceDigest: sha256ContentHash(fingerprintRecords.join("\n")),
      sourceIds: Object.freeze([...sourceIdSet].sort((a, b) => a.localeCompare(b))),
      contentHashes: Object.freeze([...contentHashSet].sort((a, b) => a.localeCompare(b))),
      authorityIds: Object.freeze([...authorityIdSet].sort((a, b) => a.localeCompare(b)))
    });
  }

  findNodeByStableKey(label: string, stableKey: string): Promise<StoredHelixNode | undefined> {
    return this.transport.findNode(this.databaseName, label, stableKey);
  }

  findNodesByLabel(label: string): Promise<readonly StoredHelixNode[]> {
    return this.transport.findNodesByLabel(this.databaseName, label);
  }

  findEdgeByStableKey(edgeLabel: string, stableKey: string): Promise<StoredHelixEdge | undefined> {
    return this.transport.findEdge(this.databaseName, edgeLabel, stableKey);
  }

  findEdgesByLabel(edgeLabel: string): Promise<readonly StoredHelixEdge[]> {
    return this.transport.findEdgesByLabel(this.databaseName, edgeLabel);
  }
}

function assertNonEmpty(field: string, value: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new HelixAppendOnlyError(`${field} must be a non-empty string.`);
  }
}

function buildElementProperties(
  provenance: ProvenanceRecord,
  extra?: Readonly<Record<string, ScalarPropertyValue>>
): Readonly<Record<string, ScalarPropertyValue>> {
  const merged: Record<string, ScalarPropertyValue> = {};
  if (extra !== undefined) {
    for (const [key, value] of Object.entries(extra)) {
      if (key === "_db" || key === "stableKey" || key === "_fromStableKey" || key === "_toStableKey") {
        throw new HelixAppendOnlyError(`Reserved internal property "${key}" cannot be supplied directly.`);
      }
      merged[key] = value;
    }
  }
  merged.sourceId = provenance.sourceId;
  merged.contentHash = provenance.contentHash;
  merged.authorityId = provenance.authorityId;
  if (provenance.locator !== undefined) {
    merged.locator = provenance.locator;
  }
  return Object.freeze(merged);
}

function extractProvenance(
  properties: Readonly<Record<string, ScalarPropertyValue>>
): ProvenanceRecord | undefined {
  const sourceId = properties.sourceId;
  const contentHash = properties.contentHash;
  const authorityId = properties.authorityId;
  const locator = properties.locator;
  if (
    typeof sourceId !== "string" ||
    typeof contentHash !== "string" ||
    !contentHash.startsWith("sha256:") ||
    typeof authorityId !== "string"
  ) {
    return undefined;
  }
  return {
    sourceId,
    contentHash: contentHash as ContentHash,
    authorityId,
    ...(typeof locator === "string" ? { locator } : {})
  };
}

function recordProvenanceLine(
  lines: string[],
  sourceIds: Set<string>,
  contentHashes: Set<ContentHash>,
  authorityIds: Set<string>,
  kind: "node" | "edge",
  label: string,
  stableKey: string,
  provenance: ProvenanceRecord
): void {
  sourceIds.add(provenance.sourceId);
  contentHashes.add(provenance.contentHash);
  authorityIds.add(provenance.authorityId);
  lines.push(
    JSON.stringify([
      kind,
      label,
      stableKey,
      provenance.sourceId,
      provenance.contentHash,
      provenance.authorityId,
      provenance.locator ?? null
    ])
  );
}
