import { createHash } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import {
  HttpHelixGraphTransport,
  assertTelemetryDisabled
} from "../../packages/helix-contrib/src/index.js";
import { handleIngestionCommand } from "../../packages/ingestion/src/cli.js";
import {
  createIngestionRuntime,
  createPortableIngestionMountResolver
} from "../../packages/ingestion/src/index.js";
import { FileBlobStore } from "../../packages/ontology/src/blob-store.js";
import {
  readOntologyWorkspaceFromHelix,
  syncLedgerToHelix
} from "../../packages/ontology/src/helix-adapter.js";
import { SQLiteEventLedger } from "../../packages/ontology/src/sqlite-event-ledger.js";
import { mountPortableWorkspace } from "../../packages/workspace/src/index.js";

interface LoadOptions {
  readonly workspaceRoot: string;
  readonly sourceDir: string;
  readonly sourceId: string;
  readonly label: string;
  readonly scanId: string;
  readonly importId: string;
  readonly approvedBy: string;
  readonly helixUrl: string;
  readonly helixDatabase?: string;
}

function parseArgs(argv: readonly string[]): LoadOptions {
  let workspaceRoot = process.env.CESTUS_WORKSPACE_ROOT;
  let sourceDir: string | undefined;
  let sourceId: string | undefined;
  let label: string | undefined;
  let scanId: string | undefined;
  let importId: string | undefined;
  let approvedBy = "actor_ingestion_cli";
  let helixUrl = process.env.CESTUS_HELIX_URL ?? "http://127.0.0.1:6969";
  let helixDatabase = process.env.CESTUS_HELIX_DATABASE;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--workspace" && next) {
      workspaceRoot = next;
      index += 1;
    } else if (arg === "--source" && next) {
      sourceDir = next;
      index += 1;
    } else if (arg === "--source-id" && next) {
      sourceId = next;
      index += 1;
    } else if (arg === "--label" && next) {
      label = next;
      index += 1;
    } else if (arg === "--scan" && next) {
      scanId = next;
      index += 1;
    } else if (arg === "--import" && next) {
      importId = next;
      index += 1;
    } else if (arg === "--approved-by" && next) {
      approvedBy = next;
      index += 1;
    } else if (arg === "--helix-url" && next) {
      helixUrl = next;
      index += 1;
    } else if (arg === "--helix-database" && next) {
      helixDatabase = next;
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        [
          "Usage: npm run helix:load-doc -- [options]",
          "",
          "Runs the Cestus ingestion pipeline (register-source, dry-run, approve-import,",
          "import, parse) on a read-only source directory and syncs the resulting Document",
          "and Passage nodes into the live HelixDB graph.",
          "",
          "Required options:",
          "  --workspace <root>      Mounted portable workspace root (or CESTUS_WORKSPACE_ROOT)",
          "  --source <dir>          Read-only directory containing the produced file(s)",
          "  --source-id <src_...>   Source collection id (must start with src_)",
          "  --label <agency label>  Human label for the producing agency/collection",
          "",
          "Optional options:",
          "  --scan <scan_...>       Scan batch id (default: scan_<timestamp>)",
          "  --import <imp_...>      Import batch id (must start with imp_; default: imp_<timestamp>)",
          "  --approved-by <actor>   Human operator id (default: actor_ingestion_cli)",
          "  --helix-url <url>       HelixDB loopback URL (default: CESTUS_HELIX_URL or http://127.0.0.1:6969)",
          "  --helix-database <name> Logical database name (default: workspaceId)",
          "",
          "Requires DO_NOT_TRACK=1 and HELIX_TELEMETRY_LEVEL=off in the environment."
        ].join("\n")
      );
      process.exit(0);
    }
  }

  if (!workspaceRoot || !sourceDir || !sourceId || !label) {
    throw new Error(
      "Missing required options: --workspace <root> --source <dir> --source-id <src_...> --label <label>"
    );
  }
  const stamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
  return {
    workspaceRoot: resolve(workspaceRoot),
    sourceDir: resolve(sourceDir),
    sourceId,
    label,
    scanId: scanId ?? `scan_${stamp}`,
    importId: importId ?? `imp_${stamp}`,
    approvedBy,
    helixUrl,
    ...(helixDatabase === undefined ? {} : { helixDatabase })
  };
}

async function runCliStep(
  command: string,
  argv: readonly string[],
  runtimeFactory: Parameters<typeof handleIngestionCommand>[0]["runtimeFactory"]
): Promise<Record<string, unknown>> {
  const output = await handleIngestionCommand({
    command,
    argv,
    mountResolver: createPortableIngestionMountResolver(),
    runtimeFactory
  });
  const parsed = JSON.parse(output) as Record<string, unknown>;
  if (parsed.ok !== true) {
    throw new Error(`Ingestion step "${command}" failed: ${JSON.stringify(parsed)}`);
  }
  return parsed;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  assertTelemetryDisabled(process.env);

  if (!existsSync(options.sourceDir) || !statSync(options.sourceDir).isDirectory()) {
    throw new Error(`--source must be an existing directory containing the produced file(s): ${options.sourceDir}`);
  }

  const mounted = mountPortableWorkspace({ rootDir: options.workspaceRoot });
  if (!mounted.ok) {
    throw new Error(`Portable workspace could not be mounted: ${mounted.diagnostic.message}`);
  }
  const databaseName = options.helixDatabase ?? mounted.workspace.workspaceId;

  const transport = new HttpHelixGraphTransport({ url: options.helixUrl, env: process.env });
  try {
    const health = await transport.healthCheck();
    if (!health.ok || !health.ready) {
      throw new Error(`HelixDB at ${options.helixUrl} is not ready (${health.detail ?? health.statusCode}).`);
    }
    const diagnostics = await transport.diagnostics();
    if (!diagnostics.storageDurableOnDisk) {
      throw new Error(
        `Refusing load: HelixDB at ${options.helixUrl} is not confirmed on-disk (HELIX_DATA_DIR).`
      );
    }

    const runtimeFactory: Parameters<typeof handleIngestionCommand>[0]["runtimeFactory"] = ({
      mountedWorkspace
    }) =>
      createIngestionRuntime({
        mountedWorkspace,
        actor: { id: options.approvedBy, kind: "human", label: "T5600 Operator" },
        afterLedgerCommit: async (workspace) => {
          const events = await workspace.ledger.readAll();
          const synced = await syncLedgerToHelix({
            transport,
            databaseName,
            events,
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

    await runCliStep(
      "register-source",
      [
        "--workspace",
        options.workspaceRoot,
        "--source",
        options.sourceDir,
        "--source-id",
        options.sourceId,
        "--label",
        options.label
      ],
      runtimeFactory
    );

    await runCliStep(
      "dry-run",
      [
        "--workspace",
        options.workspaceRoot,
        "--source-id",
        options.sourceId,
        "--scan",
        options.scanId
      ],
      runtimeFactory
    );

    await runCliStep(
      "approve-import",
      [
        "--workspace",
        options.workspaceRoot,
        "--source-id",
        options.sourceId,
        "--scan",
        options.scanId,
        "--import",
        options.importId,
        "--approved-by",
        options.approvedBy
      ],
      runtimeFactory
    );

    const imported = await runCliStep(
      "import",
      [
        "--workspace",
        options.workspaceRoot,
        "--source-id",
        options.sourceId,
        "--scan",
        options.scanId,
        "--import",
        options.importId
      ],
      runtimeFactory
    );

    const parsed = await runCliStep(
      "parse",
      ["--workspace", options.workspaceRoot, "--source-id", options.sourceId],
      runtimeFactory
    );

    // Cross-check ledger, blob store, and live Helix readback.
    const ledger = new SQLiteEventLedger(mounted.workspace.paths.ledgerPath);
    try {
      const events = await ledger.readAll();
      const blobStore = new FileBlobStore(mounted.workspace.paths.blobRoot);
      const helixDto = await readOntologyWorkspaceFromHelix({
        transport,
        databaseName,
        ledger
      });

      const verifiedDocuments: Array<Record<string, unknown>> = [];
      for (const doc of helixDto.documents ?? []) {
        const blobBytes = await blobStore.get(doc.contentHash);
        const computedHash = `sha256:${createHash("sha256").update(blobBytes).digest("hex")}`;
        if (computedHash !== doc.contentHash) {
          throw new Error(`Blob hash mismatch for ${doc.evidenceId}!`);
        }
        const ledgerMatch = events.some(
          (event) =>
            event.type === "evidence.ingested" &&
            event.payload.evidenceId === doc.evidenceId &&
            event.payload.contentHash === doc.contentHash
        );
        if (!ledgerMatch) {
          throw new Error(`Helix document ${doc.evidenceId} has no matching evidence.ingested ledger event!`);
        }
        verifiedDocuments.push({
          evidenceId: doc.evidenceId,
          contentHash: doc.contentHash,
          mediaType: doc.mediaType,
          extractionStatus: doc.extractionStatus,
          unextracted: doc.unextracted,
          passageCount: doc.passageCount,
          authorityEventId: doc.authorityEventId,
          sourceCollectionId: doc.sourceCollectionId,
          importBatchId: doc.importBatchId,
          blobHashVerified: true,
          ledgerEventVerified: true
        });
      }

      console.log(
        JSON.stringify(
          {
            ok: true,
            workspaceId: mounted.workspace.workspaceId,
            databaseName,
            helixUrl: options.helixUrl,
            importBatchId: options.importId,
            importTotals: imported.totals,
            parseJobs: parsed.jobs,
            ledgerEventCount: events.length,
            verifiedDocuments
          },
          null,
          2
        )
      );
    } finally {
      ledger.close();
    }
  } finally {
    await transport.close();
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      },
      null,
      2
    )
  );
  process.exit(1);
});
