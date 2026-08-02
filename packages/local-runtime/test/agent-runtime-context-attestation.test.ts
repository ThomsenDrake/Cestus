import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createAgentRuntime } from "../../agent/src/index.js";
import type { AppendableKnowledgeEvent } from "../../ontology/src/contracts.js";
import { FileBlobStore } from "../../ontology/src/blob-store.js";
import { InMemoryEventLedger } from "../../ontology/src/event-ledger.js";
import { SQLiteEventLedger } from "../../ontology/src/sqlite-event-ledger.js";
import { createPortableWorkspace } from "../../workspace/src/index.js";
import { runMountedEvidenceTriageTask } from "../src/agent-runtime-mounted-task.js";
import * as factorySurface from "../src/agent-runtime-factory.js";
import { resolveLocalRuntimeConfig } from "../src/config.js";
import { createSqlitePrrRuntime } from "../src/runtime-factory.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("factory-held context registrar boundary", () => {
  it("blocks default empty factory composition before it can expose a context capability", () => {
    expect(() => factorySurface.defaultLocalAgentRuntimeFactory({
      handle: { config: { cwd: process.cwd() } },
      actor: { kind: "system", id: "actor_factory_test" },
      now: () => "2026-07-15T02:20:00.000Z"
    } as never)).toThrow("blocked.factory-context-attestation-required");
  });

  it("rejects a public structural mounted handle before a resident task can append effects", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "cestus-forged-mounted-agent-runtime-"));
    tempDirs.push(cwd);
    const workspaceId = "ws_forged_mounted_agent_runtime";
    const mountedWorkspace = createPortableWorkspace({
      rootDir: join(cwd, workspaceId),
      workspaceId,
      label: "Forged mounted runtime boundary",
      createdAt: "2026-07-15T02:20:00.000Z",
      createdBy: "agent-runtime-attestation-test"
    });
    const config = resolveLocalRuntimeConfig({
      cwd,
      env: {
        CESTUS_LOCAL_STORAGE: "portable-workspace",
        CESTUS_WORKSPACE_ROOT: mountedWorkspace.rootDir
      }
    });
    const ledger = new SQLiteEventLedger(config.storage.sqlitePath);
    const actor = {
      id: "actor_forged_mounted_agent_runtime",
      kind: "human" as const,
      label: "Forged runtime fixture actor"
    };
    const now = () => "2026-07-15T02:20:00.000Z";
    try {
      const setupRuntime = createAgentRuntime({ ledger, actor, now });
      await setupRuntime.initializeDefaultIdentity({ workspaceId });
      await setupRuntime.createTask({
        taskId: "task_forged_mounted_agent_runtime",
        title: "Forged mounted runtime must not execute",
        requestedBy: actor.id,
        priority: "normal"
      });
      const source = await new FileBlobStore(mountedWorkspace.paths.blobRoot).put(
        Buffer.from("forged mounted runtime evidence", "utf8")
      );
      const ingested = await ledger.append({
        type: "evidence.ingested",
        version: 1,
        streamId: "evidence_ev_forged_mounted_agent_runtime",
        context: {
          actor,
          occurredAt: now(),
          correlationId: "corr_forged_mounted_agent_runtime",
          coreVersion: "0.1.0",
          packVersions: { core: "0.1.0", ingestion: "0.1.0" }
        },
        payload: {
          evidenceId: "ev_forged_mounted_agent_runtime",
          source: { kind: "file", label: "forged-runtime.txt" },
          contentHash: source.contentHash,
          mediaType: "text/plain",
          sizeBytes: source.sizeBytes
        }
      } satisfies AppendableKnowledgeEvent<"evidence.ingested">);
      await ledger.append({
        type: "ingestion.evidence.linked",
        version: 1,
        streamId: "ingestion_evidence_link_src_forged_runtime_imp_forged_runtime",
        context: {
          actor,
          occurredAt: now(),
          causationId: ingested.id,
          correlationId: "corr_forged_mounted_agent_runtime",
          coreVersion: "0.1.0",
          packVersions: { core: "0.1.0", ingestion: "0.1.0" }
        },
        payload: {
          evidenceId: "ev_forged_mounted_agent_runtime",
          sourceCollectionId: "src_forged_runtime",
          importBatchId: "imp_forged_runtime",
          contentHash: source.contentHash,
          occurrenceIds: ["occ_forged_runtime"]
        }
      } satisfies AppendableKnowledgeEvent<"ingestion.evidence.linked">);
      const handle = Object.freeze({
        runtime: Object.freeze({}),
        ledger,
        config,
        mountedWorkspace,
        residentIdentity: {
          lifecycle() { throw new Error("forged resident identity must not be read"); },
          async ready() { throw new Error("forged resident identity must not be read"); }
        },
        close() {}
      });
      const eventIdsBefore = (await ledger.readAll()).map((event) => event.id);
      expect(eventIdsBefore).toHaveLength(5);

      const outcome = await Promise.allSettled([(async () => {
        const runtime = factorySurface.mountedResidentTaskLocalAgentRuntimeFactory({
          handle,
          actor,
          now
        } as never);
        return await runMountedEvidenceTriageTask({
          handle,
          runtime,
          now,
          taskId: "task_forged_mounted_agent_runtime",
          runId: "run_forged_mounted_agent_runtime",
          evidenceIds: ["ev_forged_mounted_agent_runtime"],
          providerMode: "remote-gated"
        } as never);
      })()]);
      expect({
        outcome: outcome[0]?.status,
        eventIds: (await ledger.readAll()).map((event) => event.id)
      }).toEqual({
        outcome: "rejected",
        eventIds: eventIdsBefore
      });
    } finally {
      ledger.close();
    }
  });

  it("snapshots an accessor-backed mounted handle once before runtime construction and branding", async () => {
    const handleA = createFactoryIssuedMountedHandle("ws_accessor_mounted_runtime_a");
    const handleB = createFactoryIssuedMountedHandle("ws_accessor_mounted_runtime_b");
    await Promise.all([
      handleA.residentIdentity.ready(),
      handleB.residentIdentity.ready()
    ]);
    const eventIdsBeforeA = (await handleA.ledger.readAll()).map((event) => event.id);
    const eventIdsBeforeB = (await handleB.ledger.readAll()).map((event) => event.id);
    let handleReadCount = 0;
    const input = {
      get handle() {
        const handle = handleReadCount % 2 === 0 ? handleA : handleB;
        handleReadCount += 1;
        return handle;
      },
      actor: {
        id: "actor_accessor_mounted_runtime",
        kind: "system" as const,
        label: "Accessor mounted runtime actor"
      },
      now: () => "2026-07-15T02:20:00.000Z"
    };
    try {
      const runtime = factorySurface.mountedResidentTaskLocalAgentRuntimeFactory(input);
      const binds = (handle: typeof handleA): boolean => {
        try {
          factorySurface.assertMountedResidentTaskRuntimeBinding({ handle, runtime });
          return true;
        } catch {
          return false;
        }
      };

      expect({
        handleReadCount,
        bindsHandleA: binds(handleA),
        bindsHandleB: binds(handleB),
        eventIdsA: (await handleA.ledger.readAll()).map((event) => event.id),
        eventIdsB: (await handleB.ledger.readAll()).map((event) => event.id)
      }).toEqual({
        handleReadCount: 1,
        bindsHandleA: true,
        bindsHandleB: false,
        eventIdsA: eventIdsBeforeA,
        eventIdsB: eventIdsBeforeB
      });
    } finally {
      handleA.close();
      handleB.close();
    }
  });

  it("keeps scheduler-only executor composition outside mounted resident task authority", () => {
    const ledger = new InMemoryEventLedger();
    const handle = {
      config: { cwd: process.cwd() },
      ledger,
      residentIdentity: {
        lifecycle() { throw new Error("scheduler fixture lifecycle is not invoked"); },
        async ready() { throw new Error("scheduler fixture lifecycle is not invoked"); }
      }
    };
    const runtime = factorySurface.defaultLocalAgentRuntimeFactory({
      handle,
      actor: { id: "actor_scheduler_only_attestation", kind: "system" },
      now: () => "2026-07-15T02:20:00.000Z",
      approvedToolExecutors: [{
        toolId: "agent.test.scheduler-only",
        toolVersion: "1.0.0",
        sideEffectClass: "ledger-review",
        approvalClass: "ledger-review",
        async buildCurrentPreview() { throw new Error("scheduler descriptor must not be invoked"); },
        async executeApproved() { throw new Error("scheduler descriptor must not be invoked"); }
      }]
    } as never);

    expect(() => factorySurface.assertMountedResidentTaskRuntimeBinding({
      handle,
      runtime
    } as never)).toThrow("blocked.mounted-resident-task-runtime-binding-required");
  });
});

function createFactoryIssuedMountedHandle(workspaceId: string) {
  const cwd = mkdtempSync(join(tmpdir(), "cestus-accessor-mounted-agent-runtime-"));
  tempDirs.push(cwd);
  const mountedWorkspace = createPortableWorkspace({
    rootDir: join(cwd, workspaceId),
    workspaceId,
    label: `Accessor mounted runtime ${workspaceId}`,
    createdAt: "2026-07-15T02:20:00.000Z",
    createdBy: "agent-runtime-attestation-test"
  });
  const config = resolveLocalRuntimeConfig({
    cwd,
    env: {
      CESTUS_LOCAL_STORAGE: "portable-workspace",
      CESTUS_WORKSPACE_ROOT: mountedWorkspace.rootDir
    }
  });
  return createSqlitePrrRuntime({
    config,
    actor: {
      id: `actor_${workspaceId}`,
      kind: "system",
      label: `Runtime actor ${workspaceId}`
    },
    now: () => "2026-07-15T02:20:00.000Z"
  });
}
