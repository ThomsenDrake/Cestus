import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAgentRuntime } from "../../agent/src/index.js";
import { createWakeSupervisorRuntime } from "../src/wake-supervisor-runtime.js";
import { issueMountedArtifactAuthorityOperationForFactory } from "../src/mounted-artifact-authority-operation.js";
import { createPortableMountedAgentArtifactStoreProducer } from "../src/portable-mounted-agent-artifact-stores.js";
import { SQLiteEventLedger } from "../../ontology/src/sqlite-event-ledger.js";
import { createPortableWorkspace } from "../../workspace/src/index.js";
import { writeLegacyCestusFixture } from "../../ingestion/test/fixtures/legacy-cestus-fixtures.js";
import { resolveLocalRuntimeConfig, type ResolvedLocalRuntimeConfig } from "../src/config.js";
import { isExactOntologyBootstrapRunProvenance } from "../src/agent-ontology-bootstrap-routes.js";
import type { LocalAgentRuntimeFactory } from "../src/agent-runtime-factory.js";
import { createLocalRuntimeHttpHandler, type LocalRuntimeHttpHandler } from "../src/http-handler.js";
import { createSqlitePrrRuntime } from "../src/runtime-factory.js";
import { handleAgentOntologyBootstrapRoute } from "../src/agent-ontology-bootstrap-routes.js";

let cwd: string;
let sourceRoot: string;
let workspaceRoot: string;
let handler: LocalRuntimeHttpHandler | undefined;
let config: ResolvedLocalRuntimeConfig;
let hostileBindingAccessorRead = false;
let hostileExtraAccessorReads = 0;

interface TestMountedOntologyBootstrapHandoff {
  readonly binding: Awaited<ReturnType<ReturnType<typeof createPortableMountedAgentArtifactStoreProducer>["bind"]>>["binding"];
  readonly controller: Awaited<ReturnType<ReturnType<typeof createPortableMountedAgentArtifactStoreProducer>["bind"]>>["controller"];
  stop(): Promise<void>;
}

type TestMountedOntologyBootstrapHandoffTransform = (
  handoff: TestMountedOntologyBootstrapHandoff
) => unknown;

const baseOntologyBootstrapRouteRuntimeFactory: LocalAgentRuntimeFactory = ({ handle, now }) =>
  createAgentRuntime({
    ledger: handle.ledger,
    actor: { id: "agent_default", kind: "agent", label: "Cestus Agent" },
    now,
    identityLifecycle: () => handle.residentIdentity.lifecycle(),
    identityLifecycleReady: () => handle.residentIdentity.ready()
  });

function runtimeFactoryWithMountedOntologyBootstrapHandoff(
  transform: TestMountedOntologyBootstrapHandoffTransform
): LocalAgentRuntimeFactory {
  return ({ handle, now }) => {
  const runtime = baseOntologyBootstrapRouteRuntimeFactory({
    handle,
    actor: { id: "agent_default", kind: "agent", label: "Cestus Agent" },
    now
  });
  return Object.freeze({
    ...runtime,
    async acquireMountedOntologyBootstrapHandoff(input: {
      readonly taskId: string;
      readonly runId: string;
      readonly attemptId: `attempt_${string}`;
      readonly runType: "ontology-bootstrap";
      readonly retryGeneration: 0;
    }) {
      let nextId = 0;
      const wakeRuntime = createWakeSupervisorRuntime({
        runtimeHandle: handle,
        actor: { id: "agent_default", kind: "agent", label: "Cestus Agent" },
        supervisorEpoch: `epoch_${input.runId}`,
        policy: {
          policyVersion: "ontology-bootstrap-handoff.v1",
          policyDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          lockStateDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        },
        now,
        createSafeId: (kind) => `${kind}_${input.runId}_${++nextId}`
      });
      try {
        const started = await wakeRuntime.supervision.start();
        if (started.outcome !== "accepted") throw new Error("test runtime mounted authority was not accepted");
        const prepared = await createPortableMountedAgentArtifactStoreProducer(
          issueMountedArtifactAuthorityOperationForFactory(wakeRuntime)
        ).bind({
          taskId: input.taskId,
          attemptId: input.attemptId,
          approvedRunId: input.runId,
          runType: input.runType,
          retryGeneration: input.retryGeneration
        });
        return transform(Object.freeze({
          binding: prepared.binding,
          controller: prepared.controller,
          stop: async () => await wakeRuntime.stop()
        }));
      } catch (error) {
        await wakeRuntime.stop().catch(() => undefined);
        throw error;
      }
    }
  });
  };
}

const ontologyBootstrapRouteRuntimeFactory: LocalAgentRuntimeFactory = runtimeFactoryWithMountedOntologyBootstrapHandoff(
  (handoff) => handoff
);

const hostileExtraAccessorOntologyBootstrapRouteRuntimeFactory: LocalAgentRuntimeFactory =
  runtimeFactoryWithMountedOntologyBootstrapHandoff((handoff) => {
    const hostile: object = Object.create(Object.prototype);
    Object.defineProperties(hostile, {
      binding: { enumerable: true, value: handoff.binding },
      controller: { enumerable: true, value: handoff.controller },
      stop: { enumerable: true, value: handoff.stop },
      extra: {
        enumerable: true,
        get() {
          hostileExtraAccessorReads += 1;
          throw new Error("hostile extra accessor must not be read");
        }
      }
    });
    return Object.freeze(hostile);
  });

const hostileOntologyBootstrapRouteRuntimeFactory: LocalAgentRuntimeFactory = ({ handle, now }) => {
  const runtime = baseOntologyBootstrapRouteRuntimeFactory({
    handle,
    actor: { id: "agent_default", kind: "agent", label: "Cestus Agent" },
    now
  });
  return Object.freeze({
    ...runtime,
    async acquireMountedOntologyBootstrapHandoff() {
      const handoff: object = Object.create(null);
      Object.defineProperties(handoff, {
        schemaVersion: {
          enumerable: true,
          value: "factory-portable-mounted-agent-handoff-result.v1"
        },
        binding: {
          enumerable: true,
          get() {
            hostileBindingAccessorRead = true;
            throw new Error("hostile binding accessor must not be read");
          }
        },
        controller: {
          enumerable: true,
          value: Object.freeze({})
        },
        stop: {
          enumerable: true,
          value: async () => undefined
        }
      });
      return Object.freeze(handoff);
    }
  });
};

beforeEach(() => {
  hostileBindingAccessorRead = false;
  hostileExtraAccessorReads = 0;
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
      now: () => "2026-07-08T16:00:00.000Z",
      agentRuntimeFactory: ontologyBootstrapRouteRuntimeFactory
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

  it("allows only the released parent identity-readiness event before rejecting an unavailable mounted provider", async () => {
    handler = createLocalRuntimeHttpHandler({
      config,
      actor: { id: "actor_route_owner", kind: "human", label: "Route Owner" },
      now: () => "2026-07-08T16:00:00.000Z",
      agentRuntimeFactory: baseOntologyBootstrapRouteRuntimeFactory
    });
    const eventTypesBefore = await eventTypes(config);

    const launch = await handler({
      method: "POST",
      url: "/api/agent/specialists/ontology-bootstrap/runs",
      body: JSON.stringify({
        taskId: "task_ontology_bootstrap_unavailable",
        runId: "run_ontology_bootstrap_unavailable",
        sourceCollectionId: "src_old_cestus",
        sourceRoot,
        scanBatchId: "scan_old_cestus_001",
        importBatchId: "imp_old_cestus_001",
        selectedCandidateIds: ["legacy_candidate_001"],
        maxCandidatesPerBundle: 50
      })
    });

    expect(launch.status).toBe(503);
    expect(JSON.parse(launch.body)).toMatchObject({
      ok: false,
      diagnostic: { message: expect.stringMatching(/mounted authority/i) }
    });
    expect((await eventTypes(config)).slice(eventTypesBefore.length)).toEqual(["agent.identity.initialized"]);
    const types = await eventTypes(config);
    for (const type of [
      "agent.specialist-run.step.recorded",
      "agent.tool.requested",
      "agent.specialist-handoff.prepared",
      "agent.specialist-handoff.recorded",
      "agent.specialist-run.completed"
    ]) {
      expect(types).not.toContain(type);
    }
  });

  it("fails closed at the direct Task123 route boundary without a mounted provider", async () => {
    const actor = { id: "actor_route_owner", kind: "human" as const, label: "Route Owner" };
    const now = () => "2026-07-08T16:00:00.000Z";
    const directHandle = createSqlitePrrRuntime({ config, actor, now });
    try {
      const runtime = baseOntologyBootstrapRouteRuntimeFactory({ handle: directHandle, actor, now });
      await initializeResidentIdentityForDirectRoute(directHandle, runtime, actor.id);
      const eventsBefore = await directHandle.ledger.readAll();
      const launch = await handleAgentOntologyBootstrapRoute({
        request: ontologyBootstrapLaunchRequest("task_ontology_bootstrap_direct_unavailable", "run_ontology_bootstrap_direct_unavailable"),
        handle: directHandle,
        actor,
        now,
        runtime
      });

      expect(launch?.status).toBe(503);
      expect(await directHandle.ledger.readAll()).toEqual(eventsBefore);
    } finally {
      directHandle.close();
    }
  });

  it("fails closed at the direct Task123 route boundary for a hostile mounted binding", async () => {
    const actor = { id: "actor_route_owner", kind: "human" as const, label: "Route Owner" };
    const now = () => "2026-07-08T16:00:00.000Z";
    const directHandle = createSqlitePrrRuntime({ config, actor, now });
    try {
      const runtime = hostileOntologyBootstrapRouteRuntimeFactory({ handle: directHandle, actor, now });
      await initializeResidentIdentityForDirectRoute(directHandle, runtime, actor.id);
      const eventsBefore = await directHandle.ledger.readAll();
      const launch = await handleAgentOntologyBootstrapRoute({
        request: ontologyBootstrapLaunchRequest("task_ontology_bootstrap_hostile", "run_ontology_bootstrap_hostile"),
        handle: directHandle,
        actor,
        now,
        runtime
      });

      expect(launch?.status).toBe(503);
      expect(hostileBindingAccessorRead).toBe(false);
      expect(await directHandle.ledger.readAll()).toEqual(eventsBefore);
    } finally {
      directHandle.close();
    }
  });

  it("rejects an unread extra enumerable getter before direct Task123 effects", async () => {
    const actor = { id: "actor_route_owner", kind: "human" as const, label: "Route Owner" };
    const now = () => "2026-07-08T16:00:00.000Z";
    const directHandle = createSqlitePrrRuntime({ config, actor, now });
    try {
      const runtime = hostileExtraAccessorOntologyBootstrapRouteRuntimeFactory({ handle: directHandle, actor, now });
      await initializeResidentIdentityForDirectRoute(directHandle, runtime, actor.id);
      const eventsBefore = await directHandle.ledger.readAll();
      const launch = await handleAgentOntologyBootstrapRoute({
        request: ontologyBootstrapLaunchRequest("task_ontology_bootstrap_extra_accessor", "run_ontology_bootstrap_extra_accessor"),
        handle: directHandle,
        actor,
        now,
        runtime
      });

      expect(launch?.status).toBe(503);
      expect(hostileExtraAccessorReads).toBe(0);
      expect(await directHandle.ledger.readAll()).toEqual(eventsBefore);
    } finally {
      directHandle.close();
    }
  });

  it("fails closed before every durable effect for a hostile runtime-mounted binding", async () => {
    handler = createLocalRuntimeHttpHandler({
      config,
      actor: { id: "actor_route_owner", kind: "human", label: "Route Owner" },
      now: () => "2026-07-08T16:00:00.000Z",
      agentRuntimeFactory: hostileOntologyBootstrapRouteRuntimeFactory
    });
    const eventTypesBefore = await eventTypes(config);

    const launch = await handler({
      method: "POST",
      url: "/api/agent/specialists/ontology-bootstrap/runs",
      body: JSON.stringify({
        taskId: "task_ontology_bootstrap_hostile",
        runId: "run_ontology_bootstrap_hostile",
        sourceCollectionId: "src_old_cestus",
        sourceRoot,
        scanBatchId: "scan_old_cestus_001",
        importBatchId: "imp_old_cestus_001",
        selectedCandidateIds: ["legacy_candidate_001"],
        maxCandidatesPerBundle: 50
      })
    });

    expect(launch.status).toBe(503);
    expect(hostileBindingAccessorRead).toBe(false);
    expect((await eventTypes(config)).slice(eventTypesBefore.length)).toEqual(["agent.identity.initialized"]);
  });

  it("requires exact canonical provenance before reusing a run", () => {
    const reportEventId = "evt_canonical_report";
    const reportHash = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const candidateSetHash = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

    expect(isExactOntologyBootstrapRunProvenance({
      sourceEventIds: [reportEventId],
      inputArtifactHashes: [reportHash, candidateSetHash],
      reportEventId,
      reportHash,
      candidateSetHash
    })).toBe(true);
    expect(isExactOntologyBootstrapRunProvenance({
      sourceEventIds: [reportEventId, "evt_unrelated_report"],
      inputArtifactHashes: [reportHash, candidateSetHash],
      reportEventId,
      reportHash,
      candidateSetHash
    })).toBe(false);
    expect(isExactOntologyBootstrapRunProvenance({
      sourceEventIds: [reportEventId],
      inputArtifactHashes: [reportHash, candidateSetHash, "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"],
      reportEventId,
      reportHash,
      candidateSetHash
    })).toBe(false);
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

async function initializeResidentIdentityForDirectRoute(
  directHandle: ReturnType<typeof createSqlitePrrRuntime>,
  runtime: ReturnType<LocalAgentRuntimeFactory>,
  initializedBy: string
): Promise<void> {
  const mountedWorkspace = directHandle.mountedWorkspace;
  if (mountedWorkspace === undefined) throw new Error("direct ontology-bootstrap route requires a mounted workspace");
  await runtime.initializeDefaultIdentity({
    workspaceId: mountedWorkspace.workspaceId,
    initializedBy
  });
}

function ontologyBootstrapLaunchRequest(taskId: string, runId: string) {
  return {
    method: "POST",
    url: "/api/agent/specialists/ontology-bootstrap/runs",
    body: JSON.stringify({
      taskId,
      runId,
      sourceCollectionId: "src_old_cestus",
      sourceRoot,
      scanBatchId: "scan_old_cestus_001",
      importBatchId: "imp_old_cestus_001",
      selectedCandidateIds: ["legacy_candidate_001"],
      maxCandidatesPerBundle: 50
    })
  };
}
