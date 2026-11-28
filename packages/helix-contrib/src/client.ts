import {
  Client,
  HelixError,
  NodeRef,
  g,
  readBatch,
  writeBatch,
  type ReadBatch,
  type Traversal,
  type WriteBatch
} from "@helix-db/helix-db";
import type { ScalarPropertyValue } from "./text-span.js";

export type HelixEnv = Readonly<Record<string, string | undefined>>;

export interface HelixHealthStatus {
  readonly ok: boolean;
  readonly ready: boolean;
  readonly mode?: string;
  readonly storage?: string;
  readonly indexRuntime?: string;
  readonly statusCode: number;
  readonly detail?: string;
}

export interface HelixDiagnosticCheck {
  readonly id: string;
  readonly category: string;
  readonly summary: string;
  readonly status: string;
  readonly detail?: string;
}

export interface HelixDiagnosticsReport {
  readonly ok: boolean;
  readonly statusCode: number;
  readonly uptimeSecs?: number;
  readonly checks: readonly HelixDiagnosticCheck[];
  readonly storageDurableOnDisk: boolean;
}

export interface StoredHelixNode {
  readonly engineId?: string;
  readonly label: string;
  readonly databaseName: string;
  readonly stableKey: string;
  readonly properties: Readonly<Record<string, ScalarPropertyValue>>;
}

export interface StoredHelixEdge {
  readonly engineId?: string;
  readonly label: string;
  readonly databaseName: string;
  readonly stableKey: string;
  readonly fromEngineId?: string;
  readonly toEngineId?: string;
  readonly fromStableKey?: string;
  readonly toStableKey?: string;
  readonly properties: Readonly<Record<string, ScalarPropertyValue>>;
}

export interface InsertHelixEdgeInput {
  readonly databaseName: string;
  readonly fromLabel: string;
  readonly fromStableKey: string;
  readonly edgeLabel: string;
  readonly stableKey: string;
  readonly toLabel: string;
  readonly toStableKey: string;
  readonly properties: Readonly<Record<string, ScalarPropertyValue>>;
}

export interface HelixGraphTransport {
  readonly endpoint: string;
  healthCheck(): Promise<HelixHealthStatus>;
  diagnostics(): Promise<HelixDiagnosticsReport>;
  assertWritePreconditions(): void;
  findNode(databaseName: string, label: string, stableKey: string): Promise<StoredHelixNode | undefined>;
  findNodesByLabel(databaseName: string, label: string): Promise<readonly StoredHelixNode[]>;
  insertNode(
    databaseName: string,
    label: string,
    stableKey: string,
    properties: Readonly<Record<string, ScalarPropertyValue>>
  ): Promise<StoredHelixNode>;
  supersedeNode(
    databaseName: string,
    label: string,
    stableKey: string,
    properties: Readonly<Record<string, ScalarPropertyValue>>,
    removePropertyKeys?: readonly string[]
  ): Promise<StoredHelixNode>;
  findEdge(databaseName: string, edgeLabel: string, stableKey: string): Promise<StoredHelixEdge | undefined>;
  findEdgesByLabel(databaseName: string, edgeLabel: string): Promise<readonly StoredHelixEdge[]>;
  insertEdge(input: InsertHelixEdgeInput): Promise<StoredHelixEdge>;
  dropDatabase(databaseName: string): Promise<void>;
  dropSyntheticNode(databaseName: string, label: string, stableKey: string): Promise<void>;
}

export class HelixTelemetryPreconditionError extends Error {
  readonly code = "HELIX_TELEMETRY_NOT_DISABLED";

  constructor(message: string) {
    super(message);
    this.name = "HelixTelemetryPreconditionError";
  }
}

export class HelixClientError extends Error {
  readonly code = "HELIX_CLIENT_ERROR";

  constructor(message: string, readonly causeError?: unknown) {
    super(message);
    this.name = "HelixClientError";
  }
}

const TRUTHY_DNT_VALUES = new Set(["1", "true", "yes", "on"]);

export function isTelemetryDisabledEnv(env: HelixEnv = process.env): boolean {
  const dnt = env.DO_NOT_TRACK?.trim().toLowerCase();
  const level = env.HELIX_TELEMETRY_LEVEL?.trim().toLowerCase();
  return dnt !== undefined && TRUTHY_DNT_VALUES.has(dnt) && level === "off";
}

export function assertTelemetryDisabled(env: HelixEnv = process.env): void {
  if (!isTelemetryDisabledEnv(env)) {
    throw new HelixTelemetryPreconditionError(
      "Refusing Helix write: set DO_NOT_TRACK=1 and HELIX_TELEMETRY_LEVEL=off in the process environment before sending writes."
    );
  }
}

export interface HelixClientOptions {
  readonly url: string;
  readonly env?: HelixEnv;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
}

export class HelixClient {
  readonly endpoint: string;
  private readonly sdkClient: Client;
  private readonly env: HelixEnv;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: HelixClientOptions) {
    const parsed = parseBaseUrl(options.url);
    this.endpoint = parsed.toString().replace(/\/+$/, "");
    this.sdkClient = Client.server(this.endpoint);
    this.env = options.env ?? process.env;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  assertWritePreconditions(): void {
    assertTelemetryDisabled(this.env);
  }

  async healthCheck(): Promise<HelixHealthStatus> {
    try {
      const response = await this.fetchWithTimeout(`${this.endpoint}/readyz`);
      const text = await response.text();
      let payload: Record<string, unknown> | undefined;
      try {
        payload = JSON.parse(text) as Record<string, unknown>;
      } catch {
        payload = undefined;
      }
      const ready = payload?.ready === true;
      const storage = typeof payload?.storage === "string" ? payload.storage : undefined;
      const mode = typeof payload?.mode === "string" ? payload.mode : undefined;
      const indexRuntime = typeof payload?.index_runtime === "string" ? payload.index_runtime : undefined;
      return Object.freeze({
        ok: response.ok && ready && (storage === undefined || storage === "open"),
        ready,
        statusCode: response.status,
        ...(mode === undefined ? {} : { mode }),
        ...(storage === undefined ? {} : { storage }),
        ...(indexRuntime === undefined ? {} : { indexRuntime }),
        ...(response.ok ? {} : { detail: `Helix /readyz returned HTTP ${response.status}.` })
      });
    } catch (error) {
      return Object.freeze({
        ok: false,
        ready: false,
        statusCode: 0,
        detail: error instanceof Error ? error.message : "Helix health check failed."
      });
    }
  }

  async diagnostics(): Promise<HelixDiagnosticsReport> {
    try {
      const response = await this.fetchWithTimeout(`${this.endpoint}/v2/diagnostics`);
      const raw = (await response.json()) as {
        uptime_secs?: unknown;
        checks?: Array<{
          id?: unknown;
          category?: unknown;
          summary?: unknown;
          status?: unknown;
          detail?: unknown;
        }>;
      };
      const checks: HelixDiagnosticCheck[] = Array.isArray(raw.checks)
        ? raw.checks
            .filter((item): item is NonNullable<typeof item> => item !== null && typeof item === "object")
            .map((item) => ({
              id: String(item.id ?? ""),
              category: String(item.category ?? ""),
              summary: String(item.summary ?? ""),
              status: String(item.status ?? ""),
              ...(typeof item.detail === "string" ? { detail: item.detail } : {})
            }))
        : [];
      const durability = checks.find((check) => check.id === "storage.durability");
      const storageDurableOnDisk =
        durability !== undefined &&
        durability.status === "pass" &&
        /local disk|s3|gcs|azure|HELIX_DATA_DIR/i.test(`${durability.summary} ${durability.detail ?? ""}`);
      return Object.freeze({
        ok: response.ok,
        statusCode: response.status,
        ...(typeof raw.uptime_secs === "number" ? { uptimeSecs: raw.uptime_secs } : {}),
        checks: Object.freeze(checks),
        storageDurableOnDisk
      });
    } catch {
      return Object.freeze({
        ok: false,
        statusCode: 0,
        checks: Object.freeze([]),
        storageDurableOnDisk: false
      });
    }
  }

  async executeRead<R = Record<string, unknown>>(batch: ReadBatch): Promise<R> {
    try {
      return await this.sdkClient.query<R>(batch.toQueryRequest()).send();
    } catch (error) {
      throw wrapSdkError("Helix read query failed", error);
    }
  }

  async executeWrite<R = Record<string, unknown>>(batch: WriteBatch): Promise<R> {
    this.assertWritePreconditions();
    try {
      return await this.sdkClient
        .requestBuilder<R>()
        .shouldAwaitDurability(true)
        .query(batch.toQueryRequest())
        .send();
    } catch (error) {
      throw wrapSdkError("Helix write query failed", error);
    }
  }

  async close(): Promise<void> {
    await this.sdkClient.close();
  }

  private async fetchWithTimeout(url: string): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.fetchImpl(url, {
        method: "GET",
        headers: { accept: "application/json" },
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }
  }
}

export class HttpHelixGraphTransport implements HelixGraphTransport {
  readonly endpoint: string;
  private readonly client: HelixClient;

  constructor(options: HelixClientOptions | HelixClient) {
    this.client = options instanceof HelixClient ? options : new HelixClient(options);
    this.endpoint = this.client.endpoint;
  }

  assertWritePreconditions(): void {
    this.client.assertWritePreconditions();
  }

  healthCheck(): Promise<HelixHealthStatus> {
    return this.client.healthCheck();
  }

  diagnostics(): Promise<HelixDiagnosticsReport> {
    return this.client.diagnostics();
  }

  async findNode(databaseName: string, label: string, stableKey: string): Promise<StoredHelixNode | undefined> {
    const batch = readBatch()
      .varAs(
        "nodes",
        g().nWithLabel(label).has("_db", databaseName).has("stableKey", stableKey).valueMap()
      )
      .returning(["nodes"]);
    const result = await this.client.executeRead<{ nodes?: unknown[] }>(batch);
    const first = Array.isArray(result.nodes) ? result.nodes[0] : undefined;
    return first === undefined ? undefined : decodeStoredNode(first, databaseName, label);
  }

  async findNodesByLabel(databaseName: string, label: string): Promise<readonly StoredHelixNode[]> {
    const batch = readBatch()
      .varAs("nodes", g().nWithLabel(label).has("_db", databaseName).valueMap())
      .returning(["nodes"]);
    const result = await this.client.executeRead<{ nodes?: unknown[] }>(batch);
    if (!Array.isArray(result.nodes)) {
      return [];
    }
    return result.nodes.map((row) => decodeStoredNode(row, databaseName, label));
  }

  async insertNode(
    databaseName: string,
    label: string,
    stableKey: string,
    properties: Readonly<Record<string, ScalarPropertyValue>>
  ): Promise<StoredHelixNode> {
    const payload: Record<string, ScalarPropertyValue> = {
      ...properties,
      _db: databaseName,
      stableKey
    };
    const batch = writeBatch()
      .varAs("created", g().addN(label, payload))
      .returning(["created"]);
    await this.client.executeWrite(batch);
    const stored = await this.findNode(databaseName, label, stableKey);
    if (stored === undefined) {
      throw new HelixClientError(`Inserted node (${label}:${stableKey}) could not be read back from Helix.`);
    }
    return stored;
  }

  async supersedeNode(
    databaseName: string,
    label: string,
    stableKey: string,
    properties: Readonly<Record<string, ScalarPropertyValue>>,
    removePropertyKeys: readonly string[] = []
  ): Promise<StoredHelixNode> {
    const payload: Record<string, ScalarPropertyValue> = {
      ...properties,
      _db: databaseName,
      stableKey
    };
    const entries = Object.entries(payload);
    const [firstKey, firstValue] = entries[0]!;
    let traversal: Traversal<"nodes", "write"> = g()
      .nWithLabel(label)
      .has("_db", databaseName)
      .has("stableKey", stableKey)
      .setProperty(firstKey, firstValue);
    for (const [key, value] of entries.slice(1)) {
      traversal = traversal.setProperty(key, value);
    }
    for (const key of removePropertyKeys) {
      if (key === "_db" || key === "stableKey" || Object.hasOwn(payload, key)) {
        continue;
      }
      traversal = traversal.removeProperty(key);
    }
    const batch = writeBatch()
      .varAs("updated", traversal)
      .returning(["updated"]);
    const writeResult = await this.client.executeWrite<{ updated?: unknown[] }>(batch);
    if (!Array.isArray(writeResult.updated) || writeResult.updated.length === 0) {
      throw new HelixClientError(`Node (${label}:${stableKey}) not found when superseding properties.`);
    }
    const stored = await this.findNode(databaseName, label, stableKey);
    if (stored === undefined) {
      throw new HelixClientError(`Superseded node (${label}:${stableKey}) could not be read back from Helix.`);
    }
    return stored;
  }

  async findEdge(databaseName: string, edgeLabel: string, stableKey: string): Promise<StoredHelixEdge | undefined> {
    const batch = readBatch()
      .varAs(
        "edges",
        g().eWithLabel(edgeLabel).has("_db", databaseName).has("stableKey", stableKey).edgeProperties()
      )
      .returning(["edges"]);
    const result = await this.client.executeRead<{ edges?: unknown[] }>(batch);
    const first = Array.isArray(result.edges) ? result.edges[0] : undefined;
    return first === undefined ? undefined : decodeStoredEdge(first, databaseName, edgeLabel);
  }

  async findEdgesByLabel(databaseName: string, edgeLabel: string): Promise<readonly StoredHelixEdge[]> {
    const batch = readBatch()
      .varAs("edges", g().eWithLabel(edgeLabel).has("_db", databaseName).edgeProperties())
      .returning(["edges"]);
    const result = await this.client.executeRead<{ edges?: unknown[] }>(batch);
    if (!Array.isArray(result.edges)) {
      return [];
    }
    return result.edges.map((row) => decodeStoredEdge(row, databaseName, edgeLabel));
  }

  async insertEdge(input: InsertHelixEdgeInput): Promise<StoredHelixEdge> {
    const payload: Record<string, ScalarPropertyValue> = {
      ...input.properties,
      _db: input.databaseName,
      stableKey: input.stableKey,
      _fromStableKey: input.fromStableKey,
      _toStableKey: input.toStableKey
    };
    const batch = writeBatch()
      .varAs(
        "fromNode",
        g().nWithLabel(input.fromLabel).has("_db", input.databaseName).has("stableKey", input.fromStableKey)
      )
      .varAs(
        "toNode",
        g().nWithLabel(input.toLabel).has("_db", input.databaseName).has("stableKey", input.toStableKey)
      )
      .varAs("edgeWrite", g().n(NodeRef.var("fromNode")).addE(input.edgeLabel, NodeRef.var("toNode"), payload))
      .returning(["fromNode", "toNode"]);
    const writeResult = await this.client.executeWrite<{ fromNode?: unknown[]; toNode?: unknown[] }>(batch);
    if (!Array.isArray(writeResult.fromNode) || writeResult.fromNode.length === 0) {
      throw new HelixClientError(
        `Source node (${input.fromLabel}:${input.fromStableKey}) not found when inserting edge ${input.edgeLabel}.`
      );
    }
    if (!Array.isArray(writeResult.toNode) || writeResult.toNode.length === 0) {
      throw new HelixClientError(
        `Target node (${input.toLabel}:${input.toStableKey}) not found when inserting edge ${input.edgeLabel}.`
      );
    }
    // SDK 3.2.0 types addE as a node stream; always re-read the created edge by stableKey.
    const stored = await this.findEdge(input.databaseName, input.edgeLabel, input.stableKey);
    if (stored === undefined) {
      throw new HelixClientError(
        `Inserted edge (${input.edgeLabel}:${input.stableKey}) could not be read back from Helix.`
      );
    }
    return stored;
  }

  async dropDatabase(databaseName: string): Promise<void> {
    const batch = writeBatch()
      .varAs("dropped", g().n(NodeRef.all()).has("_db", databaseName).drop())
      .returning(["dropped"]);
    await this.client.executeWrite(batch);
  }

  async dropSyntheticNode(databaseName: string, label: string, stableKey: string): Promise<void> {
    if (!label.startsWith("Synthetic")) {
      throw new HelixClientError(
        `dropSyntheticNode only permits Synthetic* labels, received "${label}".`
      );
    }
    const batch = writeBatch()
      .varAs(
        "dropped",
        g().nWithLabel(label).has("_db", databaseName).has("stableKey", stableKey).drop()
      )
      .returning(["dropped"]);
    await this.client.executeWrite(batch);
  }

  close(): Promise<void> {
    return this.client.close();
  }
}

export class InMemoryHelixGraphTransport implements HelixGraphTransport {
  readonly endpoint: string;
  private readonly env: HelixEnv;
  private healthy = true;
  private nextEngineId = 1;
  private readonly nodes: StoredHelixNode[] = [];
  private readonly edges: StoredHelixEdge[] = [];

  constructor(options: { readonly endpoint?: string; readonly env?: HelixEnv } = {}) {
    this.endpoint = options.endpoint ?? "memory://helix-test";
    this.env = options.env ?? { DO_NOT_TRACK: "1", HELIX_TELEMETRY_LEVEL: "off" };
  }

  setHealthy(healthy: boolean): void {
    this.healthy = healthy;
  }

  assertWritePreconditions(): void {
    assertTelemetryDisabled(this.env);
  }

  async healthCheck(): Promise<HelixHealthStatus> {
    return Object.freeze({
      ok: this.healthy,
      ready: this.healthy,
      mode: "writer",
      storage: this.healthy ? "open" : "closed",
      indexRuntime: this.healthy ? "ready" : "unavailable",
      statusCode: this.healthy ? 200 : 503
    });
  }

  async diagnostics(): Promise<HelixDiagnosticsReport> {
    return Object.freeze({
      ok: this.healthy,
      statusCode: this.healthy ? 200 : 503,
      uptimeSecs: 1,
      checks: Object.freeze([
        {
          id: "storage.durability",
          category: "storage",
          summary: "In-memory test transport",
          status: "pass"
        }
      ]),
      storageDurableOnDisk: false
    });
  }

  async findNode(databaseName: string, label: string, stableKey: string): Promise<StoredHelixNode | undefined> {
    this.assertHealthy();
    return this.nodes.find(
      (node) => node.databaseName === databaseName && node.label === label && node.stableKey === stableKey
    );
  }

  async findNodesByLabel(databaseName: string, label: string): Promise<readonly StoredHelixNode[]> {
    this.assertHealthy();
    return this.nodes.filter((node) => node.databaseName === databaseName && node.label === label);
  }

  async insertNode(
    databaseName: string,
    label: string,
    stableKey: string,
    properties: Readonly<Record<string, ScalarPropertyValue>>
  ): Promise<StoredHelixNode> {
    this.assertWritePreconditions();
    this.assertHealthy();
    const node: StoredHelixNode = Object.freeze({
      engineId: String(this.nextEngineId++),
      label,
      databaseName,
      stableKey,
      properties: Object.freeze({ ...properties, _db: databaseName, stableKey })
    });
    this.nodes.push(node);
    return node;
  }

  async supersedeNode(
    databaseName: string,
    label: string,
    stableKey: string,
    properties: Readonly<Record<string, ScalarPropertyValue>>,
    removePropertyKeys: readonly string[] = []
  ): Promise<StoredHelixNode> {
    this.assertWritePreconditions();
    this.assertHealthy();
    const index = this.nodes.findIndex(
      (node) => node.databaseName === databaseName && node.label === label && node.stableKey === stableKey
    );
    if (index < 0) {
      throw new HelixClientError(`Node (${label}:${stableKey}) not found when superseding properties.`);
    }
    const existing = this.nodes[index]!;
    const nextProps: Record<string, ScalarPropertyValue> = { ...existing.properties };
    for (const key of removePropertyKeys) {
      if (key !== "_db" && key !== "stableKey") {
        delete nextProps[key];
      }
    }
    for (const [key, value] of Object.entries(properties)) {
      nextProps[key] = value;
    }
    nextProps._db = databaseName;
    nextProps.stableKey = stableKey;
    const updated: StoredHelixNode = Object.freeze({
      ...(existing.engineId === undefined ? {} : { engineId: existing.engineId }),
      label,
      databaseName,
      stableKey,
      properties: Object.freeze(nextProps)
    });
    this.nodes[index] = updated;
    return updated;
  }

  async findEdge(databaseName: string, edgeLabel: string, stableKey: string): Promise<StoredHelixEdge | undefined> {
    this.assertHealthy();
    return this.edges.find(
      (edge) => edge.databaseName === databaseName && edge.label === edgeLabel && edge.stableKey === stableKey
    );
  }

  async findEdgesByLabel(databaseName: string, edgeLabel: string): Promise<readonly StoredHelixEdge[]> {
    this.assertHealthy();
    return this.edges.filter((edge) => edge.databaseName === databaseName && edge.label === edgeLabel);
  }

  async insertEdge(input: InsertHelixEdgeInput): Promise<StoredHelixEdge> {
    this.assertWritePreconditions();
    this.assertHealthy();
    const from = await this.findNode(input.databaseName, input.fromLabel, input.fromStableKey);
    if (from === undefined) {
      throw new HelixClientError(`Source node (${input.fromLabel}:${input.fromStableKey}) not found.`);
    }
    const to = await this.findNode(input.databaseName, input.toLabel, input.toStableKey);
    if (to === undefined) {
      throw new HelixClientError(`Target node (${input.toLabel}:${input.toStableKey}) not found.`);
    }
    const edge: StoredHelixEdge = Object.freeze({
      engineId: String(this.nextEngineId++),
      label: input.edgeLabel,
      databaseName: input.databaseName,
      stableKey: input.stableKey,
      ...(from.engineId === undefined ? {} : { fromEngineId: from.engineId }),
      ...(to.engineId === undefined ? {} : { toEngineId: to.engineId }),
      fromStableKey: input.fromStableKey,
      toStableKey: input.toStableKey,
      properties: Object.freeze({
        ...input.properties,
        _db: input.databaseName,
        stableKey: input.stableKey,
        _fromStableKey: input.fromStableKey,
        _toStableKey: input.toStableKey
      })
    });
    this.edges.push(edge);
    return edge;
  }

  async dropDatabase(databaseName: string): Promise<void> {
    this.assertWritePreconditions();
    this.assertHealthy();
    for (let i = this.nodes.length - 1; i >= 0; i -= 1) {
      if (this.nodes[i]?.databaseName === databaseName) {
        this.nodes.splice(i, 1);
      }
    }
    for (let i = this.edges.length - 1; i >= 0; i -= 1) {
      if (this.edges[i]?.databaseName === databaseName) {
        this.edges.splice(i, 1);
      }
    }
  }

  async dropSyntheticNode(databaseName: string, label: string, stableKey: string): Promise<void> {
    this.assertWritePreconditions();
    this.assertHealthy();
    if (!label.startsWith("Synthetic")) {
      throw new HelixClientError(`dropSyntheticNode only permits Synthetic* labels, received "${label}".`);
    }
    const removedIds = new Set<string>();
    for (let i = this.nodes.length - 1; i >= 0; i -= 1) {
      const candidate = this.nodes[i];
      if (
        candidate !== undefined &&
        candidate.databaseName === databaseName &&
        candidate.label === label &&
        candidate.stableKey === stableKey
      ) {
        if (candidate.engineId !== undefined) {
          removedIds.add(candidate.engineId);
        }
        this.nodes.splice(i, 1);
      }
    }
    for (let i = this.edges.length - 1; i >= 0; i -= 1) {
      const edge = this.edges[i];
      if (
        edge !== undefined &&
        edge.databaseName === databaseName &&
        ((edge.fromEngineId !== undefined && removedIds.has(edge.fromEngineId)) ||
          (edge.toEngineId !== undefined && removedIds.has(edge.toEngineId)))
      ) {
        this.edges.splice(i, 1);
      }
    }
  }

  private assertHealthy(): void {
    if (!this.healthy) {
      throw new HelixClientError("Helix transport is unavailable.");
    }
  }
}

function parseBaseUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch (error) {
    throw new HelixClientError(`Invalid Helix URL "${rawUrl}".`, error);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new HelixClientError(`Helix URL must use http or https, received "${parsed.protocol}".`);
  }
  return parsed;
}

function wrapSdkError(prefix: string, error: unknown): HelixClientError {
  if (error instanceof HelixClientError) {
    return error;
  }
  if (error instanceof HelixError) {
    return new HelixClientError(`${prefix}: ${error.message}`, error);
  }
  return new HelixClientError(
    `${prefix}: ${error instanceof Error ? error.message : String(error)}`,
    error
  );
}

function decodeStoredNode(raw: unknown, fallbackDb: string, fallbackLabel: string): StoredHelixNode {
  const record = asRecord(raw);
  const properties = extractScalarProperties(record);
  const engineId = stringifyEngineId(record.$id);
  const label = typeof record.$label === "string" ? record.$label : fallbackLabel;
  const databaseName = typeof properties._db === "string" ? properties._db : fallbackDb;
  const stableKey = typeof properties.stableKey === "string" ? properties.stableKey : "";
  return Object.freeze({
    ...(engineId === undefined ? {} : { engineId }),
    label,
    databaseName,
    stableKey,
    properties
  });
}

function decodeStoredEdge(raw: unknown, fallbackDb: string, fallbackLabel: string): StoredHelixEdge {
  const record = asRecord(raw);
  const properties = extractScalarProperties(record);
  const engineId = stringifyEngineId(record.$id);
  const fromEngineId = stringifyEngineId(record.$from);
  const toEngineId = stringifyEngineId(record.$to);
  const label = typeof record.$label === "string" ? record.$label : fallbackLabel;
  const databaseName = typeof properties._db === "string" ? properties._db : fallbackDb;
  const stableKey = typeof properties.stableKey === "string" ? properties.stableKey : "";
  const fromStableKey = typeof properties._fromStableKey === "string" ? properties._fromStableKey : undefined;
  const toStableKey = typeof properties._toStableKey === "string" ? properties._toStableKey : undefined;
  return Object.freeze({
    ...(engineId === undefined ? {} : { engineId }),
    label,
    databaseName,
    stableKey,
    ...(fromEngineId === undefined ? {} : { fromEngineId }),
    ...(toEngineId === undefined ? {} : { toEngineId }),
    ...(fromStableKey === undefined ? {} : { fromStableKey }),
    ...(toStableKey === undefined ? {} : { toStableKey }),
    properties
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function stringifyEngineId(value: unknown): string | undefined {
  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  return undefined;
}

function extractScalarProperties(record: Record<string, unknown>): Readonly<Record<string, ScalarPropertyValue>> {
  const result: Record<string, ScalarPropertyValue> = {};
  for (const [key, value] of Object.entries(record)) {
    if (key.startsWith("$")) {
      continue;
    }
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      result[key] = value;
    } else if (typeof value === "bigint") {
      result[key] = Number(value);
    }
  }
  return Object.freeze(result);
}
