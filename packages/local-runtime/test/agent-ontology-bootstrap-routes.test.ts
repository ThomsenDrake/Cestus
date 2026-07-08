import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SQLiteEventLedger } from "../../ontology/src/sqlite-event-ledger.js";
import { createPortableWorkspace } from "../../workspace/src/index.js";
import { writeLegacyCestusFixture } from "../../ingestion/test/fixtures/legacy-cestus-fixtures.js";
import { resolveLocalRuntimeConfig, type ResolvedLocalRuntimeConfig } from "../src/config.js";
import { createLocalRuntimeHttpHandler, type LocalRuntimeHttpHandler } from "../src/http-handler.js";

let cwd: string;
let sourceRoot: string;
let workspaceRoot: string;
let handler: LocalRuntimeHttpHandler | undefined;
let config: ResolvedLocalRuntimeConfig;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "cestus-bootstrap-route-"));
  sourceRoot = mkdtempSync(join(tmpdir(), "cestus-bootstrap-source-"));
  workspaceRoot = join(cwd, "workspace");
  createPortableWorkspace({
    rootDir: workspaceRoot,
    workspaceId: "ws_bootstrap_route",
    label: "Bootstrap route workspace",
    createdAt: "2026-07-08T16:00:00.000Z",
    createdBy: "agent-ontology-bootstrap-route-test"
  });
  writeLegacyCestusFixture(sourceRoot);
  config = resolveLocalRuntimeConfig({
    cwd,
    env: {
      CESTUS_LOCAL_STORAGE: "portable-workspace",
      CESTUS_WORKSPACE_ROOT: workspaceRoot
    }
  });
});

afterEach(() => {
  handler?.close();
  handler = undefined;
  rmSync(cwd, { recursive: true, force: true });
  rmSync(sourceRoot, { recursive: true, force: true });
});

describe("ontology-bootstrap agent routes", () => {
  it("launches and reads a resident ontology-bootstrap run without approval decisions", async () => {
    handler = createLocalRuntimeHttpHandler({
      config,
      actor: { id: "actor_route_owner", kind: "human", label: "Route Owner" },
      now: () => "2026-07-08T16:00:00.000Z"
    });

    const launch = await handler({
      method: "POST",
      url: "/api/agent/specialists/ontology-bootstrap/runs",
      body: JSON.stringify({
        taskId: "task_ontology_bootstrap_route",
        runId: "run_ontology_bootstrap_route",
        sourceCollectionId: "src_old_cestus",
        sourceRoot,
        scanBatchId: "scan_old_cestus_001",
        importBatchId: "imp_old_cestus_001",
        selectedCandidateIds: ["legacy_candidate_001"],
        maxCandidatesPerBundle: 50
      })
    });

    expect(launch.status).toBe(200);
    const body = JSON.parse(launch.body);
    expect(body).toMatchObject({
      schemaVersion: "agent-ontology-bootstrap-route.v1",
      runId: "run_ontology_bootstrap_route",
      taskId: "task_ontology_bootstrap_route",
      phase: "raw-import-review",
      selectedCandidateIds: [],
      pendingApprovalToolRequestIds: ["toolreq_ontology_bootstrap_raw_import_approval"]
    });
    expect(body.reviewBundleHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(JSON.stringify(body)).not.toMatch(/api key|authorization|bearer|password|secret/i);
    expect(JSON.stringify(body)).not.toContain(sourceRoot);

    const read = await handler({
      method: "GET",
      url: "/api/agent/specialists/ontology-bootstrap/runs/run_ontology_bootstrap_route"
    });
    expect(read.status).toBe(200);
    expect(JSON.parse(read.body)).toMatchObject({
      schemaVersion: "agent-ontology-bootstrap-route.v1",
      runId: "run_ontology_bootstrap_route",
      taskId: "task_ontology_bootstrap_route",
      pendingApprovalToolRequestIds: ["toolreq_ontology_bootstrap_raw_import_approval"]
    });

    const status = await handler({ method: "GET", url: "/api/agent/status" });
    expect(JSON.parse(status.body).runs.map((run: { readonly runId: string }) => run.runId)).toContain(
      "run_ontology_bootstrap_route"
    );
    expect(await eventTypes(config)).not.toEqual(expect.arrayContaining([
      "agent.tool.approved",
      "legacy.ontology.staging.approved",
      "assertion.proposed",
      "assertion.accepted"
    ]));
  });
});

async function eventTypes(runtimeConfig: ResolvedLocalRuntimeConfig): Promise<readonly string[]> {
  const ledger = new SQLiteEventLedger(runtimeConfig.storage.sqlitePath);
  try {
    return (await ledger.readAll()).map((event) => event.type);
  } finally {
    ledger.close();
  }
}
