import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  HttpHelixGraphTransport,
  InMemoryHelixGraphTransport
} from "../../helix-contrib/src/index.js";
import { createPortableIngestionMountResolver } from "../../ingestion/src/portable-mount.js";
import { createIngestionRuntime } from "../../ingestion/src/runtime.js";
import { FileBlobStore } from "../../ontology/src/blob-store.js";
import { syncLedgerToHelix } from "../../ontology/src/helix-adapter.js";
import { SQLiteEventLedger } from "../../ontology/src/sqlite-event-ledger.js";
import { createPortableWorkspace } from "../../workspace/src/index.js";
import { runNodeWorkspaceOperation } from "../../workspace-ops/src/node-runner.js";
import {
  createHelixProjectionBuilder,
  rebuildProjection,
  type ProjectionArtifactFileSystem
} from "../../workspace-ops/src/projection-rebuild.js";
import { createProvisionalWorkspaceLayout } from "../../workspace-ops/src/layout.js";
import { resolveLocalRuntimeConfig } from "../src/config.js";
import { createLocalRuntimeHttpHandler, type LocalRuntimeHttpHandler } from "../src/http-handler.js";
import { startLocalRuntimeServer, type LocalRuntimeServerHandle } from "../src/server.js";

const tempDirs: string[] = [];
let activeServer: LocalRuntimeServerHandle | undefined;
let activeHandler: LocalRuntimeHttpHandler | undefined;

afterEach(async () => {
  await activeServer?.close();
  activeServer = undefined;
  await activeHandler?.close();
  activeHandler = undefined;
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

function createTestWorkspace(prefix: string) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  const rootDir = join(dir, "workspace");
  createPortableWorkspace({
    rootDir,
    workspaceId: "ws_helix_m2",
    label: "Milestone 2 Synthetic Workspace",
    createdBy: "test",
    createdAt: "2026-11-28T00:00:00.000Z"
  });
  new SQLiteEventLedger(join(rootDir, "ledger", "ontology.sqlite")).close();
  const sourceRoot = join(dir, "source");
  mkdirSync(sourceRoot);
  const sampleText = "Synthetic agency production record: Facility A transferred 12 detainees on 2026-03-14.\n";
  writeFileSync(join(sourceRoot, "production-001.txt"), sampleText, "utf8");
  return { dir, rootDir, sourceRoot, sampleText };
}

describe("Helix-backed ontology HTTP routes (Milestone 2)", () => {
  it("fails closed with 503 when neither Helix nor a test reader is configured", async () => {
    const { dir, rootDir } = createTestWorkspace("cestus-helix-unconfigured-");
    const config = resolveLocalRuntimeConfig({
      cwd: dir,
      env: {
        CESTUS_LOCAL_STORAGE: "portable-workspace",
        CESTUS_WORKSPACE_ROOT: rootDir,
        CESTUS_LOCAL_AUTH_TOKEN: "synthetic-token"
      }
    });
    activeHandler = createLocalRuntimeHttpHandler({
      config,
      actor: { id: "operator_m2", kind: "human", label: "M2 Investigator" }
    });

    const response = await activeHandler({
      method: "GET",
      url: "/api/ontology/workspace",
      headers: { authorization: "Bearer synthetic-token" }
    });
    expect(response.status).toBe(503);
    const body = JSON.parse(response.body);
    expect(body.status).toBe("degraded");
    expect(body.diagnostics[0].code).toBe("ledger-unavailable");
  });

  it("ingests a document into Helix, serves it from /api/ontology/workspace, fails closed when Helix stops, and rebuilds identically", async () => {
    const { dir, rootDir, sourceRoot, sampleText } = createTestWorkspace("cestus-helix-route-");
    const transport = new InMemoryHelixGraphTransport();
    const base = resolveLocalRuntimeConfig({
      cwd: dir,
      env: {
        CESTUS_LOCAL_STORAGE: "portable-workspace",
        CESTUS_WORKSPACE_ROOT: rootDir,
        CESTUS_LOCAL_AUTH_TOKEN: "synthetic-token"
      }
    });
    activeServer = await startLocalRuntimeServer({
      config: {
        ...base,
        operator: { id: "operator_m2", kind: "human", label: "M2 Investigator" },
        http: { ...base.http, port: 0 }
      },
      helixTransportForTest: transport
    });
    const address = activeServer.server.address();
    if (!address || typeof address === "string") throw new Error("No server address");
    const origin = `http://127.0.0.1:${address.port}`;

    async function api(path: string, body?: unknown, expectedStatus = 200) {
      const response = await fetch(origin + path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          authorization: "Bearer synthetic-token",
          "content-type": "application/json"
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
      const json = await response.json();
      expect(response.status, JSON.stringify(json)).toBe(expectedStatus);
      return json;
    }

    await api("/api/ingestion/sources", {
      sourceCollectionId: "src_seminole_synth",
      label: "Synthetic Seminole Production",
      rootUri: pathToFileURL(sourceRoot).href,
      sourceRoot
    });
    await api("/api/ingestion/scans/dry-run", {
      sourceCollectionId: "src_seminole_synth",
      scanBatchId: "scan_001"
    });
    await api("/api/ingestion/imports/approve", {
      sourceCollectionId: "src_seminole_synth",
      scanBatchId: "scan_001",
      importBatchId: "imp_001"
    });
    const imported = await api("/api/ingestion/imports/run", {
      sourceCollectionId: "src_seminole_synth",
      scanBatchId: "scan_001",
      importBatchId: "imp_001"
    });
    expect(imported.helixSync).toMatchObject({ ok: true, stale: false });

    const parsed = await api("/api/ingestion/parse/run", {
      sourceCollectionId: "src_seminole_synth"
    });
    expect(parsed.helixSync).toMatchObject({ ok: true, stale: false });

    // Verify ledger + blob store hash match the expected file bytes.
    const expectedHash = `sha256:${createHash("sha256").update(sampleText, "utf8").digest("hex")}`;
    const ledgerPath = join(rootDir, "ledger", "ontology.sqlite");
    const ledger = new SQLiteEventLedger(ledgerPath);
    let ledgerEventsBeforeRebuild;
    try {
      ledgerEventsBeforeRebuild = await ledger.readAll();
    } finally {
      ledger.close();
    }
    const ingestedEvent = ledgerEventsBeforeRebuild.find((event) => event.type === "evidence.ingested");
    expect(ingestedEvent).toBeDefined();
    if (ingestedEvent?.type !== "evidence.ingested") throw new Error("expected evidence.ingested");
    expect(ingestedEvent.payload.contentHash).toBe(expectedHash);

    const blobStore = new FileBlobStore(join(rootDir, "blobs"));
    const blobBytes = await blobStore.get(expectedHash as `sha256:${string}`);
    expect(blobBytes.toString("utf8")).toBe(sampleText);

    // GET /api/ontology/workspace returns the document from Helix.
    const workspaceDto = await api("/api/ontology/workspace");
    expect(workspaceDto.status).toBe("ready");
    expect(workspaceDto.documents).toHaveLength(1);
    expect(workspaceDto.documents[0]).toMatchObject({
      evidenceId: ingestedEvent.payload.evidenceId,
      contentHash: expectedHash,
      extractionStatus: "extracted",
      unextracted: false,
      passageCount: 1,
      sourceCollectionId: "src_seminole_synth",
      importBatchId: "imp_001"
    });
    expect(workspaceDto.documents[0].passages[0]).toMatchObject({
      evidenceId: ingestedEvent.payload.evidenceId,
      contentHash: expectedHash,
      text: sampleText.trim()
    });

    // Stopping Helix makes /api/ontology/workspace fail closed with 503.
    transport.setHealthy(false);
    const downDto = await api("/api/ontology/workspace", undefined, 503);
    expect(downDto.status).toBe("degraded");
    expect(downDto.documents).toBeUndefined();

    // Bring Helix back, drop the database, prove lag fails closed (503), then rebuild.
    transport.setHealthy(true);
    await transport.dropDatabase("ws_helix_m2");
    const lagDto = await api("/api/ontology/workspace", undefined, 503);
    expect(lagDto.status).toBe("degraded");
    expect(lagDto.diagnostics[0].code).toBe("projection-lag");

    // Rebuild via workspace-ops rebuildProjection + createHelixProjectionBuilder.
    const layout = createProvisionalWorkspaceLayout(rootDir);
    const writes: Record<string, string> = {};
    const fakeFs: ProjectionArtifactFileSystem = {
      async exists() { return true; },
      async writeText(path, content) { writes[path] = content; },
      async remove() {},
      async promoteDirectory() {},
      async availableBytes() { return 1_000_000; }
    };
    const rebuildEnvelope = await rebuildProjection({
      layout,
      projectionName: "helix",
      fileSystem: fakeFs,
      eventReader: { async readAll() { return ledgerEventsBeforeRebuild; } },
      builder: createHelixProjectionBuilder({
        projectionName: "helix",
        databaseName: "ws_helix_m2",
        transport,
        blobStore,
        derivativeStore: new FileBlobStore(join(rootDir, "derivatives"))
      }),
      rebuildId: "rb_test_001"
    });
    expect(rebuildEnvelope.status).toBe("ready");

    // After rebuild, /api/ontology/workspace serves the exact same evidenceId + contentHash.
    const afterRebuildDto = await api("/api/ontology/workspace");
    expect(afterRebuildDto.documents).toHaveLength(1);
    expect(afterRebuildDto.documents[0]).toMatchObject({
      evidenceId: ingestedEvent.payload.evidenceId,
      contentHash: expectedHash,
      passageCount: 1
    });

    // SQLite ledger event count is unchanged by rebuild.
    const ledgerAfter = new SQLiteEventLedger(ledgerPath);
    try {
      expect((await ledgerAfter.readAll()).length).toBe(ledgerEventsBeforeRebuild.length);
    } finally {
      ledgerAfter.close();
    }
  });

  it("syncs a second import into an existing source and an append-only source label update with zero lag", async () => {
    const { dir, rootDir, sourceRoot } = createTestWorkspace("cestus-helix-second-import-");
    const transport = new InMemoryHelixGraphTransport();
    const base = resolveLocalRuntimeConfig({
      cwd: dir,
      env: {
        CESTUS_LOCAL_STORAGE: "portable-workspace",
        CESTUS_WORKSPACE_ROOT: rootDir,
        CESTUS_LOCAL_AUTH_TOKEN: "synthetic-token"
      }
    });
    activeServer = await startLocalRuntimeServer({
      config: {
        ...base,
        operator: { id: "operator_m2", kind: "human", label: "M2 Investigator" },
        http: { ...base.http, port: 0 }
      },
      helixTransportForTest: transport
    });
    const address = activeServer.server.address();
    if (!address || typeof address === "string") throw new Error("No server address");
    const origin = `http://127.0.0.1:${address.port}`;

    async function api(path: string, body?: unknown, expectedStatus = 200) {
      const response = await fetch(origin + path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          authorization: "Bearer synthetic-token",
          "content-type": "application/json"
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
      const json = await response.json();
      expect(response.status, JSON.stringify(json)).toBe(expectedStatus);
      return json;
    }

    await api("/api/ingestion/sources", {
      sourceCollectionId: "src_osceola_county",
      label: "Osceola County",
      rootUri: pathToFileURL(sourceRoot).href,
      sourceRoot
    });
    await api("/api/ingestion/scans/dry-run", { sourceCollectionId: "src_osceola_county", scanBatchId: "scan_001" });
    await api("/api/ingestion/imports/approve", { sourceCollectionId: "src_osceola_county", scanBatchId: "scan_001", importBatchId: "imp_001" });
    const imp1 = await api("/api/ingestion/imports/run", { sourceCollectionId: "src_osceola_county", scanBatchId: "scan_001", importBatchId: "imp_001" });
    expect(imp1.helixSync).toMatchObject({ ok: true, stale: false });
    const parse1 = await api("/api/ingestion/parse/run", { sourceCollectionId: "src_osceola_county" });
    expect(parse1.helixSync).toMatchObject({ ok: true, stale: false });

    // Add a second document into the SAME source and import incrementally.
    writeFileSync(join(sourceRoot, "production-002.txt"), "Second Osceola production file with distinct bytes.\n", "utf8");
    await api("/api/ingestion/scans/dry-run", { sourceCollectionId: "src_osceola_county", scanBatchId: "scan_002" });
    await api("/api/ingestion/imports/approve", { sourceCollectionId: "src_osceola_county", scanBatchId: "scan_002", importBatchId: "imp_002" });
    const imp2 = await api("/api/ingestion/imports/run", { sourceCollectionId: "src_osceola_county", scanBatchId: "scan_002", importBatchId: "imp_002" });
    expect(imp2.helixSync).toMatchObject({ ok: true, stale: false });
    const parse2 = await api("/api/ingestion/parse/run", { sourceCollectionId: "src_osceola_county" });
    expect(parse2.helixSync).toMatchObject({ ok: true, stale: false });

    const dtoAfterSecond = await api("/api/ontology/workspace");
    expect(dtoAfterSecond.status).toBe("ready");
    expect(dtoAfterSecond.documents).toHaveLength(2);
    expect(dtoAfterSecond.documents.every((doc: { agencyName?: string }) => doc.agencyName === "Osceola County")).toBe(true);

    // Apply append-only label update through ingestion runtime + Helix afterLedgerCommit.
    const mounted = await createPortableIngestionMountResolver().resolve({ workspaceRoot: rootDir });
    if (!mounted.ok) throw new Error("expected portable workspace to mount");
    try {
      const runtime = createIngestionRuntime({
        mountedWorkspace: mounted.workspace,
        actor: { id: "operator_m2", kind: "human", label: "M2 Investigator" },
        afterLedgerCommit: async (workspace) => {
          const synced = await syncLedgerToHelix({
            transport,
            databaseName: "ws_helix_m2",
            events: await workspace.ledger.readAll(),
            blobStore: workspace.blobStore,
            derivativeStore: workspace.derivativeStore
          });
          return {
            ok: true,
            stale: false,
            databaseName: synced.databaseName,
            endpoint: synced.endpoint,
            ledgerEventCount: synced.ledgerEventCount
          };
        }
      });
      const updated = await runtime.updateSource({
        sourceCollectionId: "src_osceola_county",
        label: "Osceola County Sheriff's Office",
        rationale: "Official agency name"
      });
      expect(updated.ok).toBe(true);
      if (updated.ok) {
        expect(updated.review.label).toBe("Osceola County Sheriff's Office");
        expect(updated.helixSync).toMatchObject({ ok: true, stale: false });
      }
    } finally {
      (mounted.workspace as { close?: () => void }).close?.();
    }

    const dtoAfterUpdate = await api("/api/ontology/workspace");
    expect(dtoAfterUpdate.status).toBe("ready");
    expect(dtoAfterUpdate.documents).toHaveLength(2);
    expect(
      dtoAfterUpdate.documents.every(
        (doc: { agencyName?: string }) => doc.agencyName === "Osceola County Sheriff's Office"
      )
    ).toBe(true);
  });
});

const liveHelixUrl = process.env.HELIX_LIVE_TEST_URL;

describe.runIf(Boolean(liveHelixUrl))("Milestone 2 live HelixDB end-to-end", () => {
  it("loads a document through HTTP ingest into live HelixDB, reads via /api/ontology/workspace, and rebuilds via workspace-ops", async () => {
    const { dir, rootDir, sourceRoot, sampleText } = createTestWorkspace("cestus-helix-live-m2-");
    const dbName = `ws_helix_m2_live_${Date.now()}`;
    const base = resolveLocalRuntimeConfig({
      cwd: dir,
      env: {
        CESTUS_LOCAL_STORAGE: "portable-workspace",
        CESTUS_WORKSPACE_ROOT: rootDir,
        CESTUS_LOCAL_AUTH_TOKEN: "synthetic-live-token",
        CESTUS_HELIX_URL: liveHelixUrl!,
        CESTUS_HELIX_DATABASE: dbName
      }
    });
    activeServer = await startLocalRuntimeServer({
      config: {
        ...base,
        operator: { id: "operator_live", kind: "human", label: "Live M2 Investigator" },
        http: { ...base.http, port: 0 }
      }
    });
    const address = activeServer.server.address();
    if (!address || typeof address === "string") throw new Error("No server address");
    const origin = `http://127.0.0.1:${address.port}`;

    async function api(path: string, body?: unknown, expectedStatus = 200) {
      const response = await fetch(origin + path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          authorization: "Bearer synthetic-live-token",
          "content-type": "application/json"
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
      const json = await response.json();
      expect(response.status, JSON.stringify(json)).toBe(expectedStatus);
      return json;
    }

    await api("/api/ingestion/sources", {
      sourceCollectionId: "src_live_001",
      label: "Live Synthetic Agency",
      rootUri: pathToFileURL(sourceRoot).href,
      sourceRoot
    });
    await api("/api/ingestion/scans/dry-run", {
      sourceCollectionId: "src_live_001",
      scanBatchId: "scan_live_001"
    });
    await api("/api/ingestion/imports/approve", {
      sourceCollectionId: "src_live_001",
      scanBatchId: "scan_live_001",
      importBatchId: "imp_live_001"
    });
    await api("/api/ingestion/imports/run", {
      sourceCollectionId: "src_live_001",
      scanBatchId: "scan_live_001",
      importBatchId: "imp_live_001"
    });
    await api("/api/ingestion/parse/run", {
      sourceCollectionId: "src_live_001"
    });

    const expectedHash = `sha256:${createHash("sha256").update(sampleText, "utf8").digest("hex")}`;
    const workspaceBefore = await api("/api/ontology/workspace");
    expect(workspaceBefore.documents).toHaveLength(1);
    const evidenceId = workspaceBefore.documents[0].evidenceId as string;
    expect(workspaceBefore.documents[0].contentHash).toBe(expectedHash);
    expect(workspaceBefore.documents[0].agencyName).toBe("Live Synthetic Agency");

    // Second import into the same source syncs incrementally to live Helix with zero lag.
    writeFileSync(join(sourceRoot, "production-002.txt"), "Live second document in same source.\n", "utf8");
    await api("/api/ingestion/scans/dry-run", { sourceCollectionId: "src_live_001", scanBatchId: "scan_live_002" });
    await api("/api/ingestion/imports/approve", { sourceCollectionId: "src_live_001", scanBatchId: "scan_live_002", importBatchId: "imp_live_002" });
    const imp2 = await api("/api/ingestion/imports/run", { sourceCollectionId: "src_live_001", scanBatchId: "scan_live_002", importBatchId: "imp_live_002" });
    expect(imp2.helixSync).toMatchObject({ ok: true, stale: false });
    const parse2 = await api("/api/ingestion/parse/run", { sourceCollectionId: "src_live_001" });
    expect(parse2.helixSync).toMatchObject({ ok: true, stale: false });

    const workspaceAfterSecond = await api("/api/ontology/workspace");
    expect(workspaceAfterSecond.documents).toHaveLength(2);

    // Apply append-only label correction and sync incrementally against live Helix.
    const mountedLive = await createPortableIngestionMountResolver().resolve({ workspaceRoot: rootDir });
    if (!mountedLive.ok) throw new Error("expected portable workspace to mount");
    const liveTransportForUpdate = new HttpHelixGraphTransport({
      url: liveHelixUrl!,
      env: { DO_NOT_TRACK: "1", HELIX_TELEMETRY_LEVEL: "off" }
    });
    try {
      const runtime = createIngestionRuntime({
        mountedWorkspace: mountedLive.workspace,
        actor: { id: "operator_live", kind: "human", label: "Live M2 Investigator" },
        afterLedgerCommit: async (workspace) => {
          const synced = await syncLedgerToHelix({
            transport: liveTransportForUpdate,
            databaseName: dbName,
            events: await workspace.ledger.readAll(),
            blobStore: workspace.blobStore,
            derivativeStore: workspace.derivativeStore
          });
          return {
            ok: true,
            stale: false,
            databaseName: synced.databaseName,
            endpoint: synced.endpoint,
            ledgerEventCount: synced.ledgerEventCount
          };
        }
      });
      const updated = await runtime.updateSource({
        sourceCollectionId: "src_live_001",
        label: "Live Corrected Sheriff's Office",
        rationale: "Verify live Helix incremental label correction"
      });
      expect(updated.ok).toBe(true);
      if (updated.ok) {
        expect(updated.helixSync).toMatchObject({ ok: true, stale: false });
      }
    } finally {
      (mountedLive.workspace as { close?: () => void }).close?.();
      await liveTransportForUpdate.close();
    }

    const workspaceAfterLabelUpdate = await api("/api/ontology/workspace");
    expect(workspaceAfterLabelUpdate.documents).toHaveLength(2);
    expect(
      workspaceAfterLabelUpdate.documents.every(
        (doc: { agencyName?: string }) => doc.agencyName === "Live Corrected Sheriff's Office"
      )
    ).toBe(true);

    // Snapshot ledger bytes and event count before drop + rebuild.
    const ledgerPath = join(rootDir, "ledger", "ontology.sqlite");
    const ledgerBytesBefore = createHash("sha256").update(readFileSync(ledgerPath)).digest("hex");

    // Drop the Helix database namespace, confirm 503 lag, then run workspace-ops projection rebuild.
    const transport = new HttpHelixGraphTransport({
      url: liveHelixUrl!,
      env: { DO_NOT_TRACK: "1", HELIX_TELEMETRY_LEVEL: "off" }
    });
    try {
      await transport.dropDatabase(dbName);
      await api("/api/ontology/workspace", undefined, 503);

      const rebuild = await runNodeWorkspaceOperation({
        command: "projection rebuild",
        argv: [
          "--root",
          rootDir,
          "--projection",
          "helix",
          "--helix-url",
          liveHelixUrl!,
          "--helix-database",
          dbName
        ]
      });
      expect(rebuild.status).toBe("ready");

      const workspaceAfter = await api("/api/ontology/workspace");
      expect(workspaceAfter.documents).toHaveLength(2);
      const originalDoc = workspaceAfter.documents.find(
        (doc: { evidenceId: string }) => doc.evidenceId === evidenceId
      );
      expect(originalDoc).toBeDefined();
      expect(originalDoc.contentHash).toBe(expectedHash);
      expect(
        workspaceAfter.documents.every(
          (doc: { agencyName?: string }) => doc.agencyName === "Live Corrected Sheriff's Office"
        )
      ).toBe(true);

      const ledgerBytesAfter = createHash("sha256").update(readFileSync(ledgerPath)).digest("hex");
      expect(ledgerBytesAfter).toBe(ledgerBytesBefore);
    } finally {
      await transport.dropDatabase(dbName).catch(() => undefined);
      await transport.close();
    }
  });
});
