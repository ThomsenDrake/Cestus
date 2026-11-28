import { execSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  AppendOnlyHelixWriter,
  EndpointAllowlist,
  HttpHelixGraphTransport,
  assertTelemetryDisabled,
  sha256ContentHash
} from "../../packages/helix-contrib/src/index.js";
import { SQLiteEventLedger } from "../../packages/ontology/src/sqlite-event-ledger.js";

interface SmokeOptions {
  readonly url: string;
  readonly databaseName: string;
  readonly restartCmd?: string;
  readonly ledgerPath?: string;
  readonly waitTimeoutMs: number;
}

interface LedgerSnapshot {
  readonly path: string;
  readonly sha256: string;
  readonly eventCount: number;
}

function parseArgs(argv: readonly string[]): SmokeOptions {
  let url = process.env.CESTUS_HELIX_URL ?? "http://127.0.0.1:6969";
  let databaseName = "helix_smoke_ephemeral";
  let restartCmd: string | undefined;
  let ledgerPath: string | undefined;
  let waitTimeoutMs = 30_000;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--url" && next) {
      url = next;
      index += 1;
    } else if (arg === "--database" && next) {
      databaseName = next;
      index += 1;
    } else if (arg === "--restart-cmd" && next) {
      restartCmd = next;
      index += 1;
    } else if (arg === "--ledger" && next) {
      ledgerPath = next;
      index += 1;
    } else if (arg === "--wait-timeout-ms" && next) {
      waitTimeoutMs = Number(next);
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        [
          "Usage: tsx scripts/helix/smoke.ts [options]",
          "",
          "Options:",
          "  --url <http://127.0.0.1:6969>   HelixDB loopback endpoint (default: CESTUS_HELIX_URL or http://127.0.0.1:6969)",
          "  --database <name>               Logical database namespace (default: helix_smoke_ephemeral)",
          "  --restart-cmd <shell command>   Command that restarts HelixDB to prove on-disk persistence",
          "  --ledger <path/to/ontology.sqlite>",
          "                                  Cestus SQLite ledger to verify untouched (creates a temporary fixture if omitted)",
          "  --wait-timeout-ms <ms>          Max wait time for /readyz after restart (default: 30000)",
          "",
          "Requires DO_NOT_TRACK=1 and HELIX_TELEMETRY_LEVEL=off in the environment."
        ].join("\n")
      );
      process.exit(0);
    }
  }

  return {
    url,
    databaseName,
    ...(restartCmd === undefined ? {} : { restartCmd }),
    ...(ledgerPath === undefined ? {} : { ledgerPath }),
    waitTimeoutMs
  };
}

function snapshotLedger(ledgerPath: string): LedgerSnapshot {
  if (!existsSync(ledgerPath)) {
    throw new Error(`Ledger file does not exist: ${ledgerPath}`);
  }
  const bytes = readFileSync(ledgerPath);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const db = new DatabaseSync(ledgerPath, { readOnly: true });
  try {
    const row = db.prepare("SELECT COUNT(*) AS count FROM ontology_events").get() as { count: number | bigint };
    return {
      path: ledgerPath,
      sha256,
      eventCount: Number(row.count)
    };
  } finally {
    db.close();
  }
}

async function waitForReady(transport: HttpHelixGraphTransport, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastDetail = "timed out";
  while (Date.now() < deadline) {
    const health = await transport.healthCheck();
    if (health.ok && health.ready) {
      return;
    }
    lastDetail = health.detail ?? `status=${health.statusCode} ready=${health.ready} storage=${health.storage ?? "unknown"}`;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`HelixDB did not become ready within ${timeoutMs}ms (${lastDetail}).`);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  // 1. Verify telemetry is explicitly disabled before sending any write.
  assertTelemetryDisabled(process.env);

  const parsedUrl = new URL(options.url);
  if (!["127.0.0.1", "localhost", "::1"].includes(parsedUrl.hostname)) {
    throw new Error(
      `Refusing non-loopback Helix endpoint "${options.url}". Milestone 1 binds Helix strictly to loopback.`
    );
  }

  let tempDir: string | undefined;
  let ledgerPath = options.ledgerPath;
  if (ledgerPath === undefined) {
    tempDir = mkdtempSync(join(tmpdir(), "cestus-helix-smoke-ledger-"));
    ledgerPath = join(tempDir, "ontology.sqlite");
    const fixtureLedger = new SQLiteEventLedger(ledgerPath);
    try {
      await fixtureLedger.append({
        type: "evidence.ingested",
        version: 1,
        streamId: "evidence_ev_smoke_fixture",
        context: {
          actor: { id: "actor_smoke", kind: "human", label: "Smoke Fixture" },
          occurredAt: "2026-11-28T00:00:00.000Z",
          correlationId: "corr_smoke_fixture",
          coreVersion: "0.1.0",
          packVersions: { core: "0.1.0" }
        },
        payload: {
          evidenceId: "ev_smoke_fixture",
          source: { kind: "file", label: "Smoke Fixture", uri: "file:///synthetic/smoke.txt" },
          contentHash: sha256ContentHash("synthetic-ledger-fixture"),
          mediaType: "text/plain",
          sizeBytes: 24
        }
      });
    } finally {
      fixtureLedger.close();
    }
  }

  const transport = new HttpHelixGraphTransport({
    url: options.url,
    env: process.env
  });

  try {
    // 2. Verify health & disk durability diagnostics.
    await waitForReady(transport, options.waitTimeoutMs);
    const diagnostics = await transport.diagnostics();
    if (!diagnostics.ok || !diagnostics.storageDurableOnDisk) {
      throw new Error(
        `HelixDB /v2/diagnostics did not confirm on-disk persistence (storageDurableOnDisk=${diagnostics.storageDurableOnDisk}). Set HELIX_DATA_DIR on the server.`
      );
    }

    // 3. Snapshot the Cestus SQLite ledger before touching Helix.
    const ledgerBefore = snapshotLedger(ledgerPath);

    // 4. Write a throwaway synthetic node (never detention data).
    const writer = new AppendOnlyHelixWriter({
      transport,
      databaseName: options.databaseName,
      allowlist: new EndpointAllowlist([])
    });
    const runId = randomUUID().slice(0, 8);
    const stableKey = `synthetic_smoke_${runId}`;
    const syntheticHash = sha256ContentHash(`synthetic-smoke-payload-${runId}`);

    const written = await writer.appendNode({
      label: "SyntheticSmokeNode",
      stableKey,
      provenance: {
        sourceId: `synthetic_src_${runId}`,
        contentHash: syntheticHash,
        authorityId: `synthetic_auth_${runId}`
      },
      properties: {
        purpose: "milestone-1-persistence-smoke"
      }
    });
    if (!written.inserted) {
      throw new Error(`Expected fresh synthetic node insertion for key ${stableKey}.`);
    }

    // 5. Restart HelixDB (if restartCmd provided) and verify persistence across restart.
    let restarted = false;
    if (options.restartCmd !== undefined) {
      execSync(options.restartCmd, { stdio: "inherit" });
      await waitForReady(transport, options.waitTimeoutMs);
      restarted = true;
    }

    const afterRestart = await writer.findNodeByStableKey("SyntheticSmokeNode", stableKey);
    if (afterRestart === undefined) {
      throw new Error(
        `Synthetic node "${stableKey}" was missing${restarted ? " after HelixDB restart" : ""}!`
      );
    }
    if (afterRestart.properties.contentHash !== syntheticHash) {
      throw new Error("Synthetic node contentHash mismatch after readback.");
    }

    // 6. Drop the throwaway synthetic node and confirm it is gone.
    await transport.dropSyntheticNode(options.databaseName, "SyntheticSmokeNode", stableKey);
    const afterDrop = await writer.findNodeByStableKey("SyntheticSmokeNode", stableKey);
    if (afterDrop !== undefined) {
      throw new Error(`Synthetic node "${stableKey}" still present after drop!`);
    }

    // 7. Re-snapshot the Cestus SQLite ledger and prove it is byte-for-byte untouched.
    const ledgerAfter = snapshotLedger(ledgerPath);
    if (
      ledgerAfter.sha256 !== ledgerBefore.sha256 ||
      ledgerAfter.eventCount !== ledgerBefore.eventCount
    ) {
      throw new Error(
        `Cestus ledger changed during Helix smoke test! before=${JSON.stringify(ledgerBefore)} after=${JSON.stringify(ledgerAfter)}`
      );
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          endpoint: options.url,
          databaseName: options.databaseName,
          telemetryDisabledEnv: true,
          storageDurableOnDisk: diagnostics.storageDurableOnDisk,
          syntheticNodeKey: stableKey,
          restarted,
          persistedAcrossRestart: restarted ? true : "skipped (pass --restart-cmd to exercise restart)",
          droppedAndConfirmedGone: true,
          ledgerUntouched: {
            path: ledgerPath,
            eventCount: ledgerAfter.eventCount,
            sha256: ledgerAfter.sha256
          }
        },
        null,
        2
      )
    );
  } finally {
    await transport.close();
    if (tempDir !== undefined) {
      rmSync(tempDir, { recursive: true, force: true });
    }
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
