import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  AppendOnlyHelixWriter,
  EndpointAllowlist,
  HelixAllowlistError,
  HelixAppendOnlyError,
  HelixClient,
  HelixProvenanceError,
  HelixTelemetryPreconditionError,
  HttpHelixGraphTransport,
  InMemoryHelixGraphTransport,
  assertTelemetryDisabled,
  isTelemetryDisabledEnv,
  prepareTextSpanNode,
  sha256ContentHash,
  validateProvenanceRecord,
  type ProvenanceRecord,
  type ReplayLogEntry
} from "../src/index.js";

const SAMPLE_HASH = sha256ContentHash("sample-source-bytes");
const OTHER_HASH = sha256ContentHash("different-source-bytes");

const BASE_PROVENANCE: ProvenanceRecord = {
  sourceId: "source_001",
  contentHash: SAMPLE_HASH,
  authorityId: "auth_001"
};

const ALLOWLIST = new EndpointAllowlist([
  { fromLabel: "Record", edgeLabel: "HAS_SPAN", toLabel: "TextSpan" },
  { fromLabel: "Batch", edgeLabel: "CONTAINS", toLabel: "Record" }
]);

describe("helix-contrib provenance and text spans", () => {
  it("validates required provenance fields and rejects malformed hashes", () => {
    expect(validateProvenanceRecord(BASE_PROVENANCE)).toEqual(BASE_PROVENANCE);

    expect(() =>
      validateProvenanceRecord({ ...BASE_PROVENANCE, sourceId: "   " })
    ).toThrow(HelixProvenanceError);
    expect(() =>
      validateProvenanceRecord({ ...BASE_PROVENANCE, contentHash: "sha256:not-hex" })
    ).toThrow(HelixProvenanceError);
    expect(() =>
      validateProvenanceRecord({ ...BASE_PROVENANCE, authorityId: "" })
    ).toThrow(HelixProvenanceError);
  });

  it("prepares generic text-span nodes with locator and sha256 spanHash", () => {
    const span = prepareTextSpanNode({
      stableKey: "span:1",
      locator: "page=1;block=1;start=0;end=12",
      text: "Hello world.",
      provenance: BASE_PROVENANCE
    });

    expect(span.label).toBe("TextSpan");
    expect(span.spanHash).toBe(sha256ContentHash("Hello world."));
    expect(span.provenance.locator).toBe("page=1;block=1;start=0;end=12");
    expect(span.properties.locator).toBe("page=1;block=1;start=0;end=12");
  });
});

describe("helix-contrib telemetry precondition", () => {
  it("requires both DO_NOT_TRACK and HELIX_TELEMETRY_LEVEL=off before writes", async () => {
    expect(isTelemetryDisabledEnv({ DO_NOT_TRACK: "1", HELIX_TELEMETRY_LEVEL: "off" })).toBe(true);
    expect(isTelemetryDisabledEnv({ DO_NOT_TRACK: "true", HELIX_TELEMETRY_LEVEL: "OFF" })).toBe(true);
    expect(isTelemetryDisabledEnv({ DO_NOT_TRACK: "1" })).toBe(false);
    expect(isTelemetryDisabledEnv({ HELIX_TELEMETRY_LEVEL: "off" })).toBe(false);
    expect(isTelemetryDisabledEnv({ DO_NOT_TRACK: "0", HELIX_TELEMETRY_LEVEL: "off" })).toBe(false);

    expect(() => assertTelemetryDisabled({ DO_NOT_TRACK: "1", HELIX_TELEMETRY_LEVEL: "basic" })).toThrow(
      HelixTelemetryPreconditionError
    );

    const transport = new InMemoryHelixGraphTransport({
      env: { DO_NOT_TRACK: "1", HELIX_TELEMETRY_LEVEL: "basic" }
    });
    const writer = new AppendOnlyHelixWriter({
      transport,
      databaseName: "db_telemetry_test",
      allowlist: ALLOWLIST
    });

    await expect(
      writer.appendNode({
        label: "Record",
        stableKey: "rec:1",
        provenance: BASE_PROVENANCE
      })
    ).rejects.toThrow(HelixTelemetryPreconditionError);
  });
});

describe("helix-contrib append-only writer", () => {
  it("refuses drop, setProperty, and removeProperty on recorded elements", () => {
    const writer = new AppendOnlyHelixWriter({
      transport: new InMemoryHelixGraphTransport(),
      databaseName: "db_append_only",
      allowlist: ALLOWLIST
    });

    expect(() => writer.drop("Record", "rec:1")).toThrow(HelixAppendOnlyError);
    expect(() => writer.setProperty("Record", "rec:1", "authorityId", "auth_mutated")).toThrow(
      HelixAppendOnlyError
    );
    expect(() => writer.removeProperty("Record", "rec:1", "contentHash")).toThrow(
      HelixAppendOnlyError
    );
  });

  it("enforces idempotent node and edge keys and endpoint allowlist", async () => {
    const transport = new InMemoryHelixGraphTransport();
    const writer = new AppendOnlyHelixWriter({
      transport,
      databaseName: "db_idempotent",
      allowlist: ALLOWLIST
    });

    const firstNode = await writer.appendNode({
      label: "Record",
      stableKey: "rec:1",
      provenance: BASE_PROVENANCE,
      properties: { title: "Record One" }
    });
    const duplicateNode = await writer.appendNode({
      label: "Record",
      stableKey: "rec:1",
      provenance: BASE_PROVENANCE,
      properties: { title: "Record One" }
    });

    expect(firstNode.inserted).toBe(true);
    expect(duplicateNode.inserted).toBe(false);
    expect(await writer.findNodesByLabel("Record")).toHaveLength(1);

    await expect(
      writer.appendNode({
        label: "Record",
        stableKey: "rec:1",
        provenance: { ...BASE_PROVENANCE, contentHash: OTHER_HASH }
      })
    ).rejects.toThrow(HelixAppendOnlyError);

    await writer.appendTextSpan({
      stableKey: "span:1",
      locator: "line:1",
      text: "Quoted line",
      provenance: BASE_PROVENANCE
    });

    const firstEdge = await writer.appendEdge({
      edgeLabel: "HAS_SPAN",
      stableKey: "edge:rec:1:span:1",
      from: { label: "Record", stableKey: "rec:1" },
      to: { label: "TextSpan", stableKey: "span:1" },
      provenance: BASE_PROVENANCE
    });
    const duplicateEdge = await writer.appendEdge({
      edgeLabel: "HAS_SPAN",
      stableKey: "edge:rec:1:span:1",
      from: { label: "Record", stableKey: "rec:1" },
      to: { label: "TextSpan", stableKey: "span:1" },
      provenance: BASE_PROVENANCE
    });

    expect(firstEdge.inserted).toBe(true);
    expect(duplicateEdge.inserted).toBe(false);
    expect(await writer.findEdgesByLabel("HAS_SPAN")).toHaveLength(1);

    await expect(
      writer.appendEdge({
        edgeLabel: "UNAUTHORIZED_EDGE",
        stableKey: "edge:bad",
        from: { label: "Record", stableKey: "rec:1" },
        to: { label: "TextSpan", stableKey: "span:1" },
        provenance: BASE_PROVENANCE
      })
    ).rejects.toThrow(HelixAllowlistError);
  });

  it("rebuilds only the exact target database and reproduces an engine-id-independent fingerprint", async () => {
    const transport = new InMemoryHelixGraphTransport();
    const writer = new AppendOnlyHelixWriter({
      transport,
      databaseName: "db_rebuild",
      allowlist: ALLOWLIST
    });

    const log: readonly ReplayLogEntry[] = [
      {
        kind: "node",
        label: "Record",
        stableKey: "rec:1",
        provenance: BASE_PROVENANCE
      },
      {
        kind: "text-span",
        stableKey: "span:1",
        locator: "block=1",
        text: "Replayable span",
        provenance: BASE_PROVENANCE
      },
      {
        kind: "edge",
        edgeLabel: "HAS_SPAN",
        stableKey: "edge:1",
        from: { label: "Record", stableKey: "rec:1" },
        to: { label: "TextSpan", stableKey: "span:1" },
        provenance: BASE_PROVENANCE
      }
    ];

    await expect(writer.rebuild("db_other", log)).rejects.toThrow(HelixAppendOnlyError);

    const first = await writer.rebuild("db_rebuild", log);
    const firstNode = await writer.findNodeByStableKey("Record", "rec:1");
    const second = await writer.rebuild("db_rebuild", log);
    const secondNode = await writer.findNodeByStableKey("Record", "rec:1");

    expect(firstNode?.engineId).not.toBe(secondNode?.engineId);
    expect(second).toEqual(first);
    expect(second.sourceIds).toEqual(["source_001"]);
    expect(second.contentHashes).toEqual([SAMPLE_HASH]);
    expect(second.authorityIds).toEqual(["auth_001"]);
  });

  it("reports health failure cleanly when Helix endpoint is unreachable", async () => {
    const client = new HelixClient({
      url: "http://127.0.0.1:1",
      env: { DO_NOT_TRACK: "1", HELIX_TELEMETRY_LEVEL: "off" },
      fetchImpl: async () => {
        throw new Error("ECONNREFUSED");
      }
    });
    const health = await client.healthCheck();
    expect(health.ok).toBe(false);
    expect(health.ready).toBe(false);
    expect(health.detail).toContain("ECONNREFUSED");
  });
});

describe("helix-contrib package boundaries", () => {
  const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

  it("ships Apache-2.0 LICENSE and imports no Cestus packages or domain symbols", () => {
    const license = readFileSync(join(packageRoot, "LICENSE"), "utf8");
    expect(license).toContain("Apache License");
    expect(license).toContain("Version 2.0, January 2004");

    const srcDir = join(packageRoot, "src");
    const sourceFiles = readdirSync(srcDir).filter((file) => file.endsWith(".ts"));
    expect(sourceFiles.length).toBeGreaterThan(0);

    for (const file of sourceFiles) {
      const content = readFileSync(join(srcDir, file), "utf8");
      expect(content).not.toMatch(/from\s+["'](?:\.\.\/){2,}(?:ontology|ingestion|prr|agent|ui|local-runtime|workspace|workspace-ops|operator-status)/);
      expect(content).not.toMatch(/\b(?:Cestus|investigation\.v1|Seminole|Osceola|Orange County|prr\.)\b/);
    }
  });
});

const liveUrl = process.env.HELIX_LIVE_TEST_URL;

describe.runIf(Boolean(liveUrl))("helix-contrib live Helix server integration", () => {
  it("writes, idempotently re-writes, and rebuilds against live HelixDB", async () => {
    const transport = new HttpHelixGraphTransport({
      url: liveUrl!,
      env: { DO_NOT_TRACK: "1", HELIX_TELEMETRY_LEVEL: "off" }
    });
    const health = await transport.healthCheck();
    expect(health.ok).toBe(true);

    const dbName = `helix_contrib_live_${Date.now()}`;
    const writer = new AppendOnlyHelixWriter({
      transport,
      databaseName: dbName,
      allowlist: ALLOWLIST
    });

    const log: readonly ReplayLogEntry[] = [
      {
        kind: "node",
        label: "Record",
        stableKey: "rec:live:1",
        provenance: BASE_PROVENANCE,
        properties: { title: "Live record" }
      },
      {
        kind: "text-span",
        stableKey: "span:live:1",
        locator: "page=1;block=1;start=0;end=10",
        text: "Live quote",
        provenance: BASE_PROVENANCE
      },
      {
        kind: "edge",
        edgeLabel: "HAS_SPAN",
        stableKey: "edge:live:1",
        from: { label: "Record", stableKey: "rec:live:1" },
        to: { label: "TextSpan", stableKey: "span:live:1" },
        provenance: BASE_PROVENANCE
      }
    ];

    const fp1 = await writer.rebuild(dbName, log);
    const dupNode = await writer.appendNode({
      label: "Record",
      stableKey: "rec:live:1",
      provenance: BASE_PROVENANCE
    });
    expect(dupNode.inserted).toBe(false);

    const dupEdge = await writer.appendEdge({
      edgeLabel: "HAS_SPAN",
      stableKey: "edge:live:1",
      from: { label: "Record", stableKey: "rec:live:1" },
      to: { label: "TextSpan", stableKey: "span:live:1" },
      provenance: BASE_PROVENANCE
    });
    expect(dupEdge.inserted).toBe(false);

    const fp2 = await writer.rebuild(dbName, log);
    expect(fp2).toEqual(fp1);

    // Clean up test database namespace
    await transport.dropDatabase(dbName);
  });
});
