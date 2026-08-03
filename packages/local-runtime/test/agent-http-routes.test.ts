import { AsyncLocalStorage } from "node:async_hooks";
import { cpSync, existsSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  buildTaskAttemptId,
  createAgentToolGateway,
  hashAgentToolPreview,
  isAgentSecretSafeText,
  type AgentApprovedToolExecutorDescriptor,
  type AgentToolPreview
} from "../../agent/src/index.js";
import type { AppendableKnowledgeEvent, KnowledgeEventOf } from "../../ontology/src/contracts.js";
import { AssertionService } from "../../ontology/src/assertion-service.js";
import { FileBlobStore } from "../../ontology/src/blob-store.js";
import { GovernanceService } from "../../ontology/src/governance-service.js";
import { SQLiteEventLedger } from "../../ontology/src/sqlite-event-ledger.js";
import {
  createPortableWorkspace,
  mountPortableWorkspace,
  type MountedPortableWorkspace
} from "../../workspace/src/index.js";
import { LOCAL_RUNTIME_SESSION_COOKIE_NAME, localRuntimeSessionCookieValue } from "../src/auth.js";
import { resolveLocalRuntimeConfig } from "../src/config.js";
import {
  contextFreeLocalAgentRuntimeFactory,
  defaultLocalAgentRuntimeFactory,
  type LocalAgentRuntimeFactory
} from "../src/agent-runtime-factory.js";
import { createMountedEvidenceTriageBackgroundExecutionPort } from "../src/agent-runtime-mounted-task.js";
import {
  createLocalRuntimeHttpHandler,
  type CreateLocalRuntimeHttpHandlerInput,
  type LocalRuntimeHttpHandler
} from "../src/http-handler.js";
import { createSqlitePrrRuntime } from "../src/runtime-factory.js";
import { createResidentSupervisionRuntime } from "../src/wake-supervisor-runtime.js";

const handlers: LocalRuntimeHttpHandler[] = [];
const tempDirs: string[] = [];
type MountedTaskBackgroundExecutionObservation = Parameters<NonNullable<
  CreateLocalRuntimeHttpHandlerInput["mountedTaskAfterBackgroundExecutionForTest"]
>>[0];
interface MountedTaskBackgroundExecutionTracker {
  observe(observation: MountedTaskBackgroundExecutionObservation): void;
  waitFor(taskId: string, runId: string): Promise<MountedTaskBackgroundExecutionObservation>;
}
const mountedTaskBackgroundExecutionTrackers = new WeakMap<
  LocalRuntimeHttpHandler,
  MountedTaskBackgroundExecutionTracker
>();
const completedFixtureWorkspaceId = "ws_mounted_evidence_triage";
const completedFixtureTaskId = "task_route_mounted_triage";
const completedFixtureRunId = "run_route_mounted_triage";
interface CompletedMountedTaskFixture {
  readonly rootDir: string;
  readonly workspaceRoot: string;
  readonly sourceEventIds: readonly string[];
}
let completedMountedTaskFixture: CompletedMountedTaskFixture | undefined;

beforeAll(async () => {
  const rootDir = mkdtempSync(join(tmpdir(), "cestus-agent-route-completed-fixture-"));
  const config = persistentPortableConfig(rootDir, completedFixtureWorkspaceId);
  let handler: LocalRuntimeHttpHandler | undefined;
  try {
    const sourceEventIds = await seedMountedEvidenceTriageSource(config);
    const additionalSourceEventIds = await seedAdditionalMountedEvidenceTriageSource(config);
    handler = testHandler({ config });
    await createMountedEvidenceTriageTask(handler, completedFixtureTaskId);
    await closeHandler(handler);
    handler = undefined;
    await seedInstalledPolicyAndIdentityLabel(config);
    let tick = 0;
    handler = testHandler({
      config,
      now: () => new Date(
        Date.parse("2026-07-07T20:00:00.000Z") + tick++ * 1_000
      ).toISOString()
    });
    const admitted = await handler({
      method: "POST",
      url: `/api/agent/tasks/${completedFixtureTaskId}/evidence-triage`,
      body: JSON.stringify({
        runId: completedFixtureRunId,
        evidenceIds: ["ev_route_mounted_triage", "ev_route_mounted_triage_second"],
        providerMode: "local-fake"
      })
    });
    if (admitted.status !== 202) {
      throw new Error(`Completed mounted task fixture admission failed: ${admitted.status}.`);
    }
    const completed = await waitForMountedTaskResult(
      handler,
      `/api/agent/tasks/${completedFixtureTaskId}/evidence-triage/${completedFixtureRunId}`
    );
    if (completed.status !== 200) {
      throw new Error(`Completed mounted task fixture execution failed: ${completed.status}.`);
    }
    await closeHandler(handler);
    handler = undefined;
    completedMountedTaskFixture = Object.freeze({
      rootDir,
      workspaceRoot: join(rootDir, completedFixtureWorkspaceId),
      sourceEventIds: Object.freeze([...sourceEventIds, ...additionalSourceEventIds])
    });
  } catch (error) {
    rmSync(rootDir, { recursive: true, force: true });
    throw error;
  } finally {
    if (handler !== undefined) await closeHandler(handler);
  }
});

afterAll(() => {
  if (completedMountedTaskFixture !== undefined) {
    rmSync(completedMountedTaskFixture.rootDir, { recursive: true, force: true });
    completedMountedTaskFixture = undefined;
  }
});

afterEach(async () => {
  for (const handler of handlers.splice(0)) {
    await handler.close();
  }
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("agent HTTP routes", () => {
  it("returns agent-status.v1 from GET /api/agent/status without live credentials", async () => {
    const config = resolveLocalRuntimeConfig({ cwd: tempDir(), env: {} });
    const handler = testHandler({ config });
    const response = await handler({ method: "GET", url: "/api/agent/status" });
    const body = JSON.parse(response.body) as {
      readonly schemaVersion: string;
      readonly providers: readonly { readonly providerId: string; readonly modelFamilies: readonly string[] }[];
      readonly identityLifecycle: { readonly state: string };
    };

    expect(response.status).toBe(200);
    expect(body.schemaVersion).toBe("agent-status.v1");
    expect(body.identityLifecycle.state).toBe("not-mounted");
    expect(body.providers).toEqual([
      expect.objectContaining({ providerId: "provider_fake_local", modelFamilies: ["fake-local"] })
    ]);
    expectAgentStatusBodyToHideRuntimeMaterial(response.body);
    await closeHandler(handler);
    expect(await eventTypes(config)).toEqual([]);
  });

  it("can surface a Nous Portal provider descriptor without leaking setup material", async () => {
    const config = resolveLocalRuntimeConfig({ cwd: tempDir(), env: {} });
    const handler = testHandler({ config, agentRuntimeFactory: nousStatusRuntimeFactory() });
    const response = await handler({ method: "GET", url: "/api/agent/status" });
    const body = JSON.parse(response.body) as {
      readonly schemaVersion: string;
      readonly providers: readonly {
        readonly providerId: string;
        readonly endpointKind: string;
        readonly modelFamilies: readonly string[];
      }[];
    };

    expect(response.status).toBe(200);
    expect(body.schemaVersion).toBe("agent-status.v1");
    expect(body.providers).toEqual(expect.arrayContaining([
      expect.objectContaining({ providerId: "provider_fake_local", modelFamilies: ["fake-local"] }),
      expect.objectContaining({
        providerId: "provider_nous_portal",
        endpointKind: "openai-compatible-api",
        modelFamilies: ["tencent/hy3:free"]
      })
    ]));
    expect(response.body).not.toContain("Cestus local runtime prompt artifact");
    expect(response.body).not.toContain(providerSetupSentinel());
    expectAgentStatusBodyToHideRuntimeMaterial(response.body);
    await closeHandler(handler);
    expect(await eventTypes(config)).toEqual([]);
  });

  it("includes provider readiness in agent status for configured Nous", async () => {
    const cwd = tempDir();
    writeFileSync(join(cwd, ".env"), ["CESTUS_AGENT_NOUS_API_KEY=runtime-provider-material"].join("\n"));
    const config = resolveLocalRuntimeConfig({ cwd, env: {} });
    const handler = testHandler({ config });

    const response = await handler({ method: "GET", url: "/api/agent/status" });
    const body = JSON.parse(response.body) as {
      readonly providerReadiness?: {
        readonly cards: ReadonlyArray<{
          readonly providerId: string;
          readonly credentialHealth: string;
          readonly dataHandlingPosture: string;
        }>;
      };
    };

    expect(response.status).toBe(200);
    expect(body.providerReadiness?.cards).toEqual(expect.arrayContaining([
      expect.objectContaining({
        providerId: "provider_nous_portal",
        credentialHealth: "local-binding-healthy",
        dataHandlingPosture: "remote-prompt-byte-transfer-gated"
      })
    ]));
    expect(response.body).not.toMatch(/runtime-provider-material|authorization:\s*bearer|provider error|response body/i);
  });

  it("returns pending tool requests from GET /api/agent/tool-requests", async () => {
    const config = resolveLocalRuntimeConfig({ cwd: tempDir(), env: {} });
    const handler = testHandler({ config });
    const response = await handler({ method: "GET", url: "/api/agent/tool-requests" });

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      schemaVersion: "agent-tool-requests.v1",
      generatedAt: "2026-07-07T20:00:00.000Z",
      pendingApprovalCount: 0,
      toolRequests: []
    });
    await closeHandler(handler);
    expect(await eventTypes(config)).toEqual([]);
  });

  it("creates a durable task through POST /api/agent/tasks", async () => {
    const config = portableConfig("ws_task_route");
    const first = testHandler({ config });
    const response = await first({
      method: "POST",
      url: "/api/agent/tasks",
      body: JSON.stringify({
        taskId: "task_route_001",
        title: "Inspect resident status",
        priority: "normal",
        description: "Check readiness before handing work to the resident agent."
      })
    });

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({ ok: true, taskId: "task_route_001" });
    await closeHandler(first);

    const second = testHandler({ config });
    const reloaded = await second({ method: "GET", url: "/api/agent/status" });
    expect(JSON.parse(reloaded.body).tasks).toContainEqual(expect.objectContaining({
      taskId: "task_route_001",
      description: "Check readiness before handing work to the resident agent."
    }));
  });

  it("continues an admitted local-fake mounted task after the browser closes and reconstructs it after restart", async () => {
    const config = portableConfig("ws_background_mounted_task");
    const sourceEventIds = await seedMountedEvidenceTriageSource(config);
    const first = testHandler({ config });
    const created = await first({
      method: "POST",
      url: "/api/agent/tasks",
      body: JSON.stringify({
        taskId: "task_background_mounted_task",
        title: "Triage admitted mounted evidence",
        priority: "normal",
        description: "Continue this exact local task after the browser closes."
      })
    });
    expect(created.status, created.body).toBe(200);

    const admitted = await first({
      method: "POST",
      url: "/api/agent/tasks/task_background_mounted_task/evidence-triage",
      body: JSON.stringify({
        runId: "run_background_mounted_task",
        evidenceIds: ["ev_route_mounted_triage"],
        providerMode: "local-fake"
      })
    });
    expect(admitted.status, admitted.body).toBe(202);
    expect(JSON.parse(admitted.body)).toMatchObject({
      schemaVersion: "agent-mounted-task-admission.v1",
      state: "admitted",
      taskId: "task_background_mounted_task",
      runId: "run_background_mounted_task",
      providerMode: "local-fake",
      sourceEventIds
    });
    const admissionEvents = await allEvents(config);
    const admission = admissionEvents.find((event) =>
      event.type === "agent.mounted-task.execution.admitted.v1" &&
      event.payload.taskId === "task_background_mounted_task"
    );
    expect(admission?.payload).toMatchObject({
      taskId: "task_background_mounted_task",
      runId: "run_background_mounted_task",
      providerMode: "local-fake",
      sourceEventIds
    });
    expect(Object.hasOwn(admission?.payload ?? {}, "evidenceBindings")).toBe(false);
    const admissionManifestHash = Reflect.get(admission?.payload ?? {}, "admissionManifestHash");
    expect(admissionManifestHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    const admissionManifestBytes = await new FileBlobStore(join(
      requireMountedWorkspace(config).paths.jobRoot,
      "agent-mounted-task-admission",
      "input"
    )).get(admissionManifestHash as `sha256:${string}`);
    const admissionManifest = JSON.parse(admissionManifestBytes.toString("utf8")) as Record<string, unknown>;
    expect(admissionManifest).toMatchObject({
      schemaVersion: "agent-mounted-task-execution-input.v1",
      workspaceId: "ws_background_mounted_task",
      residentAgentId: "agent_default",
      taskId: "task_background_mounted_task",
      runId: "run_background_mounted_task",
      runType: "evidence-triage",
      providerMode: "local-fake",
      evidenceIds: ["ev_route_mounted_triage"],
      evidenceBindings: [expect.objectContaining({
        evidenceId: "ev_route_mounted_triage",
        evidenceEventId: sourceEventIds[0],
        linkEventId: sourceEventIds[1]
      })],
      sourceEventIds,
      workspaceManifestHash: Reflect.get(admission?.payload ?? {}, "workspaceManifestHash"),
      policyEventId: Reflect.get(admission?.payload ?? {}, "policyEventId"),
      policyId: Reflect.get(admission?.payload ?? {}, "policyId"),
      policyVersion: Reflect.get(admission?.payload ?? {}, "policyVersion"),
      policyHash: Reflect.get(admission?.payload ?? {}, "policyHash"),
      activeLocksHash: Reflect.get(admission?.payload ?? {}, "activeLocksHash")
    });
    const repeatedAdmission = await first({
      method: "POST",
      url: "/api/agent/tasks/task_background_mounted_task/evidence-triage",
      body: JSON.stringify({
        runId: "run_background_mounted_task",
        evidenceIds: ["ev_route_mounted_triage"],
        providerMode: "local-fake"
      })
    });
    expect(repeatedAdmission.status, repeatedAdmission.body).toBe(202);
    expect(JSON.parse(repeatedAdmission.body)).toEqual(JSON.parse(admitted.body));
    const repeatedEvents = await allEvents(config);
    expect(repeatedEvents.filter((event) =>
      event.type === "agent.mounted-task.execution.admitted.v1" &&
      event.payload.taskId === "task_background_mounted_task"
    )).toHaveLength(1);
    expect(Reflect.get(
      repeatedEvents.find((event) => event.type === "agent.mounted-task.execution.admitted.v1")?.payload ?? {},
      "admissionManifestHash"
    )).toBe(admissionManifestHash);

    // Closing the initiating browser/request owner does not own execution.
    await closeHandler(first);
    const restarted = testHandler({ config, now: () => "2026-07-07T20:06:00.000Z" });
    const reconstructed = await waitForMountedTaskResult(
      restarted,
      "/api/agent/tasks/task_background_mounted_task/evidence-triage/run_background_mounted_task"
    );
    expect(reconstructed.status, reconstructed.body).toBe(200);
    expect(JSON.parse(reconstructed.body)).toMatchObject({
      schemaVersion: "agent-mounted-task-result.v1",
      state: "completed",
      taskId: "task_background_mounted_task",
      runId: "run_background_mounted_task",
      handoff: { status: "ready-for-review" }
    });
    expect((await allEvents(config)).filter((event) =>
      event.type === "agent.mounted-task.execution.admitted.v1" &&
      event.payload.taskId === "task_background_mounted_task"
    )).toHaveLength(1);
    await closeHandler(restarted);
  });

  it("restarts from an admission-only local task when the former service never dispatches it", async () => {
    const config = portableConfig("ws_background_admission_only_restart");
    await seedMountedEvidenceTriageSource(config);
    let releaseScan: () => void = () => undefined;
    let markScanEntered: () => void = () => undefined;
    let markScanFinished: () => void = () => undefined;
    const scanRelease = new Promise<void>((resolve) => { releaseScan = resolve; });
    const scanEntered = new Promise<void>((resolve) => { markScanEntered = resolve; });
    const scanFinished = new Promise<void>((resolve) => { markScanFinished = resolve; });
    let executeCount = 0;
    const first = testHandler({
      config,
      residentBackgroundExecutionForTest: {
        async pendingLocalTasks() {
          markScanEntered();
          await scanRelease;
          markScanFinished();
          return [];
        },
        async execute() {
          executeCount += 1;
        }
      }
    });
    await scanEntered;

    let admitted;
    try {
      await createMountedEvidenceTriageTask(first, "task_background_admission_only_restart");
      admitted = await first({
        method: "POST",
        url: "/api/agent/tasks/task_background_admission_only_restart/evidence-triage",
        body: JSON.stringify({
          runId: "run_background_admission_only_restart",
          evidenceIds: ["ev_route_mounted_triage"],
          providerMode: "local-fake"
        })
      });
    } finally {
      releaseScan();
    }
    if (admitted === undefined) throw new Error("Admission response was not observed.");
    expect(admitted.status, admitted.body).toBe(202);
    await scanFinished;
    expect(executeCount).toBe(0);
    const admissionOnlyEvents = await allEvents(config);
    expect(admissionOnlyEvents.filter((event) =>
      event.type === "agent.mounted-task.execution.admitted.v1" &&
      event.payload.taskId === "task_background_admission_only_restart"
    )).toHaveLength(1);
    expect(admissionOnlyEvents.some((event) =>
      event.type === "agent.specialist-run.started" &&
      event.payload.runId === "run_background_admission_only_restart"
    )).toBe(false);

    await closeHandler(first);
    const restarted = testHandler({ config, now: () => "2026-07-07T20:06:00.000Z" });
    const reconstructed = await waitForMountedTaskResult(
      restarted,
      "/api/agent/tasks/task_background_admission_only_restart/evidence-triage/run_background_admission_only_restart"
    );
    expect(reconstructed.status, reconstructed.body).toBe(200);
    expect(JSON.parse(reconstructed.body)).toMatchObject({
      state: "completed",
      taskId: "task_background_admission_only_restart",
      runId: "run_background_admission_only_restart",
      handoff: { status: "ready-for-review" },
      memoryId: "mem_run_background_admission_only_restart_handoff"
    });
  });

  it("isolates one stale admission and still returns a later valid local task", async () => {
    const config = portableConfig("ws_background_stale_then_valid");
    await seedMountedEvidenceTriageSource(config);
    const admissionOnlyExecution = {
      async pendingLocalTasks() { return []; },
      async execute() { throw new Error("Admission-only fixture must not execute tasks."); }
    };
    const first = testHandler({
      config,
      residentBackgroundExecutionForTest: admissionOnlyExecution
    });
    const staleTaskId = "task_background_stale_admission";
    const staleRunId = "run_background_stale_admission";
    const validTaskId = "task_background_valid_after_stale";
    const validRunId = "run_background_valid_after_stale";
    for (const { taskId, runId } of [
      { taskId: staleTaskId, runId: staleRunId },
      { taskId: validTaskId, runId: validRunId }
    ]) {
      await createMountedEvidenceTriageTask(first, taskId);
      const admitted = await first({
        method: "POST",
        url: `/api/agent/tasks/${taskId}/evidence-triage`,
        body: JSON.stringify({
          runId,
          evidenceIds: ["ev_route_mounted_triage"],
          providerMode: "local-fake"
        })
      });
      expect(admitted.status, admitted.body).toBe(202);
    }
    await closeHandler(first);

    const before = await allEvents(config);
    const staleAdmission = before.find((event) =>
      event.type === "agent.mounted-task.execution.admitted.v1" &&
      event.payload.taskId === staleTaskId && event.payload.runId === staleRunId
    );
    if (staleAdmission?.type !== "agent.mounted-task.execution.admitted.v1") {
      throw new Error("Stale admission fixture is unavailable.");
    }
    const digest = staleAdmission.payload.admissionManifestHash.slice("sha256:".length);
    rmSync(join(
      requireMountedWorkspace(config).paths.jobRoot,
      "agent-mounted-task-admission",
      "input",
      "sha256",
      digest.slice(0, 2),
      digest
    ));

    const handle = createSqlitePrrRuntime({
      config,
      actor: { id: "actor_stale_admission_scan", kind: "human", label: "Stale admission scan" },
      now: () => "2026-07-07T20:06:00.000Z"
    });
    try {
      await handle.residentIdentity.ready();
      const background = createMountedEvidenceTriageBackgroundExecutionPort({
        handle,
        now: () => "2026-07-07T20:06:00.000Z"
      });

      await expect(background.pendingLocalTasks()).resolves.toEqual([
        { taskId: validTaskId, runId: validRunId }
      ]);
      await expect(background.pendingLocalTasks()).resolves.toEqual([
        { taskId: validTaskId, runId: validRunId }
      ]);

      const after = await handle.ledger.readAll();
      const diagnostics = after.filter((event) =>
        event.type === "diagnostic.recorded" && event.context.causationId === staleAdmission.id
      );
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.payload).toEqual({
        diagnosticId: expect.stringMatching(/^diag_[a-zA-Z0-9_-]+$/),
        severity: "error",
        category: "validation",
        message: "Mounted local task admission is stale and was skipped.",
        repairHint: {
          contract: "agent.mounted-task.execution.admitted.v1",
          violatedPath: "payload.admissionManifestHash",
          allowedActions: ["review the stale admission", "create a new task and admission"]
        }
      });
      expect(after.some((event) =>
        event.type === "agent.specialist-run.started" && event.payload.runId === staleRunId
      )).toBe(false);
    } finally {
      handle.close();
    }
  });

  it("recovers terminal mounted work before memory observation without duplicate execution", async () => {
    const config = portableConfig("ws_background_terminal_before_memory");
    await seedMountedEvidenceTriageSource(config);
    let crashCount = 0;
    const first = testHandler({
      config,
      mountedTaskBeforeCompletionMemoryForTest() {
        crashCount += 1;
        throw new Error("Simulated service loss after terminal ledger state.");
      }
    });
    const taskId = "task_background_terminal_before_memory";
    const runId = "run_background_terminal_before_memory";
    await createMountedEvidenceTriageTask(first, taskId);
    const admitted = await first({
      method: "POST",
      url: `/api/agent/tasks/${taskId}/evidence-triage`,
      body: JSON.stringify({
        runId,
        evidenceIds: ["ev_route_mounted_triage"],
        providerMode: "local-fake"
      })
    });
    expect(admitted.status, admitted.body).toBe(202);

    const crashed = await waitForMountedBackgroundExecution(first, taskId, runId);
    expect(crashed.outcome).toBe("failed");
    const terminal = await allEvents(config);
    expect(crashCount).toBeGreaterThan(0);
    expect(terminal.filter((event) =>
      event.type === "agent.memory.recorded" && event.payload.memoryId === `mem_${runId}_handoff`
    )).toHaveLength(0);
    expect(terminal.filter((event) =>
      event.type === "agent.model-invocation.requested" && event.payload.runId === runId
    )).toHaveLength(1);
    expect(terminal.filter((event) =>
      event.type === "agent.model-invocation.completed" && event.payload.runId === runId
    )).toHaveLength(1);

    await closeHandler(first);
    const restarted = testHandler({ config, now: () => "2026-07-07T20:06:00.000Z" });
    const recovered = await waitForMountedTaskResult(
      restarted,
      `/api/agent/tasks/${taskId}/evidence-triage/${runId}`
    );
    expect(recovered.status, recovered.body).toBe(200);
    expect(JSON.parse(recovered.body)).toMatchObject({
      state: "completed",
      taskId,
      runId,
      memoryId: `mem_${runId}_handoff`
    });
    const recoveredEvents = await allEvents(config);
    expect(recoveredEvents.filter((event) =>
      event.type === "agent.specialist-run.completed" && event.payload.runId === runId
    )).toHaveLength(1);
    expect(recoveredEvents.filter((event) =>
      event.type === "agent.model-invocation.requested" && event.payload.runId === runId
    )).toHaveLength(1);
    expect(recoveredEvents.filter((event) =>
      event.type === "agent.model-invocation.completed" && event.payload.runId === runId
    )).toHaveLength(1);
    expect(recoveredEvents.filter((event) =>
      event.type === "agent.specialist-handoff.recorded" && event.payload.runId === runId
    )).toHaveLength(1);
    expect(recoveredEvents.filter((event) =>
      event.type === "agent.memory.recorded" && event.payload.memoryId === `mem_${runId}_handoff`
    )).toHaveLength(1);
  });

  it.each([
    {
      boundary: "agent.specialist-run.completed before orchestration completion",
      blockedType: "agent.task.orchestration.completed" as const
    },
    {
      boundary: "agent.task.orchestration.completed before task completion",
      blockedType: "agent.task.status.changed" as const
    }
  ])("recovers the exact terminal suffix after $boundary", async ({ blockedType }) => {
    const suffix = blockedType === "agent.task.orchestration.completed" ? "run_terminal" : "orchestration_terminal";
    const config = portableConfig(`ws_background_partial_${suffix}`);
    await seedMountedEvidenceTriageSource(config);
    const taskId = `task_background_partial_${suffix}`;
    const runId = `run_background_partial_${suffix}`;
    let crashCount = 0;
    const originalGuardedAppend = SQLiteEventLedger.prototype.appendWithPrecommitGuard;
    SQLiteEventLedger.prototype.appendWithPrecommitGuard = async function (event, options, guard) {
      const isBoundary = blockedType === "agent.task.orchestration.completed"
        ? event.type === blockedType && event.payload.taskId === taskId
        : event.type === blockedType && event.payload.taskId === taskId &&
          event.payload.runId === runId && event.payload.status === "completed";
      return await originalGuardedAppend.call(this, event, options, () => {
        guard();
        if (isBoundary) {
          crashCount += 1;
          throw new Error(`Simulated service loss before ${blockedType} commit.`);
        }
      });
    };

    let first: LocalRuntimeHttpHandler | undefined;
    try {
      first = testHandler({ config });
      await createMountedEvidenceTriageTask(first, taskId);
      const admitted = await first({
        method: "POST",
        url: `/api/agent/tasks/${taskId}/evidence-triage`,
        body: JSON.stringify({
          runId,
          evidenceIds: ["ev_route_mounted_triage"],
          providerMode: "local-fake"
        })
      });
      expect(admitted.status, admitted.body).toBe(202);
      const crashed = await waitForMountedBackgroundExecution(first, taskId, runId);
      expect(crashed.outcome).toBe("failed");
      expect(crashCount).toBeGreaterThan(0);
      const prefix = await allEvents(config);
      expect(prefix.some((event) => blockedType === "agent.task.orchestration.completed"
        ? event.type === blockedType && event.payload.taskId === taskId && event.payload.runId === runId
        : event.type === blockedType && event.payload.taskId === taskId &&
          event.payload.runId === runId && event.payload.status === "completed"
      )).toBe(false);
      await closeHandler(first);
      first = undefined;
    } finally {
      SQLiteEventLedger.prototype.appendWithPrecommitGuard = originalGuardedAppend;
      if (first !== undefined) await closeHandler(first);
    }

    const restarted = testHandler({ config, now: () => "2026-07-07T20:06:00.000Z" });
    const recovered = await waitForMountedTaskResult(
      restarted,
      `/api/agent/tasks/${taskId}/evidence-triage/${runId}`
    );
    expect(recovered.status, recovered.body).toBe(200);
    expect(JSON.parse(recovered.body)).toMatchObject({
      state: "completed",
      taskId,
      runId,
      memoryId: `mem_${runId}_handoff`
    });

    const events = await allEvents(config);
    const count = (type: string) => events.filter((event) =>
      event.type === type && Reflect.get(event.payload, "runId") === runId
    ).length;
    expect({
      modelRequested: count("agent.model-invocation.requested"),
      modelCompleted: count("agent.model-invocation.completed"),
      handoffPrepared: count("agent.specialist-handoff.prepared"),
      handoffRecorded: count("agent.specialist-handoff.recorded"),
      runCompleted: count("agent.specialist-run.completed"),
      orchestrationCompleted: count("agent.task.orchestration.completed"),
      taskCompleted: events.filter((event) => event.type === "agent.task.status.changed" &&
        event.payload.taskId === taskId && event.payload.runId === runId &&
        event.payload.status === "completed").length,
      memoryRecorded: events.filter((event) => event.type === "agent.memory.recorded" &&
        event.payload.memoryId === `mem_${runId}_handoff`).length
    }).toEqual({
      modelRequested: 1,
      modelCompleted: 1,
      handoffPrepared: 1,
      handoffRecorded: 1,
      runCompleted: 1,
      orchestrationCompleted: 1,
      taskCompleted: 1,
      memoryRecorded: 1
    });
  });

  it("fails closed without writes for an inconsistent terminal prefix", async () => {
    const config = portableConfig("ws_background_inconsistent_terminal_prefix");
    await seedMountedEvidenceTriageSource(config);
    const taskId = "task_background_inconsistent_terminal_prefix";
    const runId = "run_background_inconsistent_terminal_prefix";
    let crashCount = 0;
    const originalGuardedAppend = SQLiteEventLedger.prototype.appendWithPrecommitGuard;
    SQLiteEventLedger.prototype.appendWithPrecommitGuard = async function (event, options, guard) {
      const block = event.type === "agent.task.orchestration.completed" &&
        event.payload.taskId === taskId && event.payload.runId === runId;
      return await originalGuardedAppend.call(this, event, options, () => {
        guard();
        if (block) {
          crashCount += 1;
          throw new Error("Simulated loss before orchestration completion.");
        }
      });
    };
    let first: LocalRuntimeHttpHandler | undefined;
    try {
      first = testHandler({ config });
      await createMountedEvidenceTriageTask(first, taskId);
      const admitted = await first({
        method: "POST",
        url: `/api/agent/tasks/${taskId}/evidence-triage`,
        body: JSON.stringify({
          runId,
          evidenceIds: ["ev_route_mounted_triage"],
          providerMode: "local-fake"
        })
      });
      expect(admitted.status, admitted.body).toBe(202);
      const crashed = await waitForMountedBackgroundExecution(first, taskId, runId);
      expect(crashed.outcome).toBe("failed");
      expect(crashCount).toBeGreaterThan(0);
      await closeHandler(first);
      first = undefined;
    } finally {
      SQLiteEventLedger.prototype.appendWithPrecommitGuard = originalGuardedAppend;
      if (first !== undefined) await closeHandler(first);
    }

    const ledger = new SQLiteEventLedger(config.storage.sqlitePath);
    try {
      const events = await ledger.readAll();
      const terminal = events.find((event): event is KnowledgeEventOf<"agent.specialist-run.completed"> =>
        event.type === "agent.specialist-run.completed" && event.payload.runId === runId
      );
      if (terminal === undefined) throw new Error("terminal prefix fixture is required");
      const taskStream = await ledger.readStream(`agent_task_${taskId}`);
      await ledger.append({
        type: "agent.task.status.changed",
        version: 1,
        streamId: `agent_task_${taskId}`,
        context: {
          actor: { id: "agent_default", kind: "agent", label: "Resident Cestus Agent" },
          occurredAt: terminal.context.occurredAt,
          causationId: terminal.id,
          correlationId: `corr_${runId}_inconsistent_task_completion`,
          coreVersion: "0.1.0",
          packVersions: { core: "0.1.0", agent: "0.1.0" }
        },
        payload: {
          taskId,
          status: "completed",
          changedBy: "agent_default",
          reason: "Inconsistent fixture skips orchestration completion.",
          runId
        }
      } satisfies AppendableKnowledgeEvent<"agent.task.status.changed">, {
        expectedGlobalEventCount: events.length,
        expectedNextSequence: taskStream.length + 1
      });
    } finally {
      ledger.close();
    }
    const before = terminalPrefixEvents(await allEvents(config), taskId, runId);
    let scanCount = 0;
    const restarted = testHandler({
      config,
      now: () => "2026-07-07T20:06:00.000Z",
      mountedTaskBackgroundScanForTest(count) {
        scanCount += count;
      }
    });
    const attempted = await waitForMountedBackgroundExecution(restarted, taskId, runId);
    expect(attempted.outcome).toBe("failed");
    expect(scanCount).toBeGreaterThan(0);
    const readback = await restarted({
      method: "GET",
      url: `/api/agent/tasks/${taskId}/evidence-triage/${runId}`
    });
    expect(readback.status, readback.body).toBe(409);
    await closeHandler(restarted);
    expect(terminalPrefixEvents(await allEvents(config), taskId, runId)).toEqual(before);
    expect(before.filter((event) => event.type === "agent.task.orchestration.completed")).toHaveLength(0);
    expect(before.filter((event) => event.type === "agent.memory.recorded")).toHaveLength(0);
  });

  it("projects durable supervision state and supports pause, resume, and cancel through production routes", async () => {
    const config = portableConfig("ws_supervision_routes");
    const handler = testHandler({ config });
    const created = await handler({
      method: "POST",
      url: "/api/agent/tasks",
      body: JSON.stringify({
        taskId: "task_supervision_routes",
        title: "Inspect supervised resident work",
        priority: "normal"
      })
    });
    expect(created.status, created.body).toBe(200);

    const cockpitBefore = await handler({ method: "GET", url: "/api/agent/cockpit" });
    expect(cockpitBefore.status, cockpitBefore.body).toBe(200);
    expect(JSON.parse(cockpitBefore.body)).toMatchObject({
      supervision: {
        schemaVersion: "agent-supervision-cockpit.v1",
        supervisorState: "running",
        workspaceState: "available",
        workspaceId: "ws_supervision_routes",
        controls: expect.arrayContaining([
          expect.objectContaining({ action: "pause", enabled: true }),
          expect.objectContaining({ action: "cancel", enabled: true, taskId: "task_supervision_routes" })
        ])
      }
    });

    const paused = await handler({ method: "POST", url: "/api/agent/supervision/pause" });
    expect(paused.status, paused.body).toBe(200);
    expect(JSON.parse(paused.body)).toMatchObject({
      supervision: {
        supervisorState: "paused",
        controls: expect.arrayContaining([
          expect.objectContaining({ action: "resume", enabled: true })
        ])
      }
    });

    await closeHandler(handler);
    const restarted = testHandler({ config });
    const reconstructed = await restarted({ method: "GET", url: "/api/agent/cockpit" });
    expect(reconstructed.status, reconstructed.body).toBe(200);
    expect(JSON.parse(reconstructed.body)).toMatchObject({
      supervision: {
        supervisorState: "paused",
        workspaceState: "available",
        controls: expect.arrayContaining([
          expect.objectContaining({ action: "resume", enabled: true })
        ])
      }
    });

    const resumed = await restarted({ method: "POST", url: "/api/agent/supervision/resume" });
    expect(resumed.status, resumed.body).toBe(200);
    expect(JSON.parse(resumed.body)).toMatchObject({
      supervision: { supervisorState: "running", workspaceState: "available" }
    });

    const canceled = await restarted({
      method: "POST",
      url: "/api/agent/tasks/task_supervision_routes/cancel"
    });
    expect(canceled.status, canceled.body).toBe(200);
    expect(JSON.parse(canceled.body)).toMatchObject({
      supervision: { workspaceState: "available" },
      task: { taskId: "task_supervision_routes", status: "canceled" }
    });
    const reloaded = await restarted({ method: "GET", url: "/api/agent/status" });
    expect(JSON.parse(reloaded.body).tasks).toContainEqual(expect.objectContaining({
      taskId: "task_supervision_routes",
      status: "canceled"
    }));
  });

  it("keeps pause pending until an active mounted task is quiescent and fenced from later writes", async () => {
    const config = portableConfig("ws_running_pause_fence");
    await seedMountedEvidenceTriageSource(config);
    const workspace = requireMountedWorkspace(config);
    const effectEntered = Promise.withResolvers<void>();
    const releaseEffect = Promise.withResolvers<void>();
    const taskId = "task_running_pause_fence";
    const runId = "run_running_pause_fence";
    const handler = testHandler({
      config,
      mountedTaskBeforeLocalEffectForTest: async () => {
        effectEntered.resolve();
        await releaseEffect.promise;
      }
    });
    await createMountedEvidenceTriageTask(handler, taskId);
    const admitted = await handler({
      method: "POST",
      url: `/api/agent/tasks/${taskId}/evidence-triage`,
      body: JSON.stringify({
        runId,
        evidenceIds: ["ev_route_mounted_triage"],
        providerMode: "local-fake"
      })
    });
    expect(admitted.status, admitted.body).toBe(202);
    await effectEntered.promise;
    const artifactStateAtFence = supervisionArtifactWriteState(workspace);

    let pauseSettled = false;
    const pausing = handler({
      method: "POST",
      url: "/api/agent/supervision/pause"
    }).then((response) => {
      pauseSettled = true;
      return response;
    });
    const pausedEvents = await waitForAgentEvents(config, (events) => events.some((event) =>
      event.type === "agent.wake.supervisor.paused.v1"
    ));
    expect(pausedEvents.some((event) => event.type === "agent.wake.supervisor.paused.v1")).toBe(true);
    const pauseSettledBeforeEffectRelease = pauseSettled;
    releaseEffect.resolve();

    const execution = await waitForMountedBackgroundExecution(handler, taskId, runId);
    const paused = await pausing;
    expect(paused.status, paused.body).toBe(200);
    expect({ pauseSettledBeforeEffectRelease, executionOutcome: execution.outcome }).toEqual({
      pauseSettledBeforeEffectRelease: false,
      executionOutcome: "failed"
    });
    expect(JSON.parse(paused.body)).toMatchObject({
      supervision: { supervisorState: "paused", activeCycle: false }
    });
    expect(supervisionArtifactWriteState(workspace)).toEqual(artifactStateAtFence);
    const events = await allEvents(config);
    expect(events.some((event) =>
      (event.type === "agent.model-invocation.requested" ||
        event.type === "agent.model-invocation.completed" ||
        event.type === "agent.specialist-handoff.recorded" ||
        event.type === "agent.memory.recorded") &&
      Reflect.get(event.payload, "runId") === runId
    )).toBe(false);
  });

  it("serializes resume behind a durably paused active cycle until the pause response settles", async () => {
    const config = portableConfig("ws_running_pause_resume_order");
    await seedMountedEvidenceTriageSource(config);
    const workspace = requireMountedWorkspace(config);
    const effectEntered = Promise.withResolvers<void>();
    const releaseEffect = Promise.withResolvers<void>();
    const taskId = "task_running_pause_resume_order";
    const runId = "run_running_pause_resume_order";
    const handler = testHandler({
      config,
      mountedTaskBeforeLocalEffectForTest: async () => {
        effectEntered.resolve();
        await releaseEffect.promise;
      }
    });
    await createMountedEvidenceTriageTask(handler, taskId);
    const admitted = await handler({
      method: "POST",
      url: `/api/agent/tasks/${taskId}/evidence-triage`,
      body: JSON.stringify({
        runId,
        evidenceIds: ["ev_route_mounted_triage"],
        providerMode: "local-fake"
      })
    });
    expect(admitted.status, admitted.body).toBe(202);
    await effectEntered.promise;
    const artifactStateAtFence = supervisionArtifactWriteState(workspace);

    let pauseSettled = false;
    const responseOrder: string[] = [];
    const pausing = handler({
      method: "POST",
      url: "/api/agent/supervision/pause"
    }).then((response) => {
      pauseSettled = true;
      responseOrder.push("pause");
      return response;
    });
    await waitForAgentEvents(config, (events) => events.some((event) =>
      event.type === "agent.wake.supervisor.paused.v1"
    ));

    const resuming = handler({
      method: "POST",
      url: "/api/agent/supervision/resume"
    }).then((response) => {
      responseOrder.push("resume");
      return response;
    });
    const resumeBeforeRelease = await promiseSettlementWithin(resuming, 500);
    const pauseSettledBeforeRelease = pauseSettled;
    const beforeReleaseEvents = await allEvents(config);
    releaseEffect.resolve();

    const execution = await waitForMountedBackgroundExecution(handler, taskId, runId);
    const [paused, resumed] = await Promise.all([pausing, resuming]);
    const finalCockpit = await handler({ method: "GET", url: "/api/agent/cockpit" });
    const events = await allEvents(config);
    const supervisionControlTypes = events.filter((event) =>
      event.type === "agent.wake.supervisor.pause.requested.v1" ||
      event.type === "agent.wake.supervisor.paused.v1" ||
      event.type === "agent.wake.supervisor.resume.requested.v1"
    ).map((event) => event.type);

    expect({ resumeBeforeRelease, pauseSettledBeforeRelease }).toEqual({
      resumeBeforeRelease: "pending",
      pauseSettledBeforeRelease: false
    });
    expect(beforeReleaseEvents.some((event) =>
      event.type === "agent.wake.supervisor.resume.requested.v1"
    )).toBe(false);
    expect(responseOrder).toEqual(["pause", "resume"]);
    expect(execution.outcome).toBe("failed");
    expect(paused.status, paused.body).toBe(200);
    expect(JSON.parse(paused.body)).toMatchObject({
      supervision: { supervisorState: "paused", activeCycle: false }
    });
    expect(resumed.status, resumed.body).toBe(200);
    expect(JSON.parse(resumed.body)).toMatchObject({
      supervision: { supervisorState: "running" }
    });
    expect(finalCockpit.status, finalCockpit.body).toBe(200);
    expect(JSON.parse(finalCockpit.body)).toMatchObject({
      supervision: { supervisorState: "running" }
    });
    expect(supervisionControlTypes).toEqual([
      "agent.wake.supervisor.pause.requested.v1",
      "agent.wake.supervisor.paused.v1",
      "agent.wake.supervisor.resume.requested.v1"
    ]);
    expect(supervisionArtifactWriteState(workspace)).toEqual(artifactStateAtFence);
    expect(events.some((event) =>
      (event.type === "agent.model-invocation.requested" ||
        event.type === "agent.model-invocation.completed" ||
        event.type === "agent.specialist-handoff.recorded" ||
        event.type === "agent.memory.recorded") &&
      Reflect.get(event.payload, "runId") === runId
    )).toBe(false);
  });

  it("joins an already-started queued resume before stop returns and permits no later lifecycle writes", async () => {
    const config = portableConfig("ws_stop_joins_queued_resume");
    const actor = { id: "actor_stop_joins_resume", kind: "human" as const, label: "Stop joins resume" };
    const handle = createSqlitePrrRuntime({
      config,
      actor,
      now: () => "2026-07-07T20:08:00.000Z"
    });
    const activeEntered = Promise.withResolvers<void>();
    const releaseActive = Promise.withResolvers<void>();
    const resumeReadEntered = Promise.withResolvers<void>();
    const releaseResumeRead = Promise.withResolvers<void>();
    const resumeContext = new AsyncLocalStorage<"resume">();
    const originalReadAll = SQLiteEventLedger.prototype.readAll;
    let offered = false;
    let heldResumeRead = false;
    let pausing: Promise<unknown> | undefined;
    let resuming: Promise<unknown> | undefined;
    let stopping: Promise<unknown> | undefined;
    let supervision: ReturnType<typeof createResidentSupervisionRuntime> | undefined;
    SQLiteEventLedger.prototype.readAll = async function () {
      if (resumeContext.getStore() === "resume" && !heldResumeRead) {
        heldResumeRead = true;
        resumeReadEntered.resolve();
        await releaseResumeRead.promise;
      }
      return await originalReadAll.call(this);
    };
    try {
      await handle.residentIdentity.ready();
      supervision = createResidentSupervisionRuntime({
        runtimeHandle: handle,
        actor,
        now: () => "2026-07-07T20:08:00.000Z",
        createSupervisorOwnerId: () => "stop_joins_queued_resume",
        backgroundExecution: {
          async pendingLocalTasks() {
            if (offered) return [];
            offered = true;
            return [{ taskId: "task_stop_joins_resume", runId: "run_stop_joins_resume" }];
          },
          async execute() {
            activeEntered.resolve();
            await releaseActive.promise;
          }
        }
      });
      await activeEntered.promise;

      pausing = supervision.pause();
      await waitForAgentEvents(config, (events) => events.some((event) =>
        event.type === "agent.wake.supervisor.paused.v1"
      ));
      resuming = resumeContext.run("resume", () => supervision!.resume());
      releaseActive.resolve();
      await pausing;
      await resumeReadEntered.promise;

      const beforeStop = await handle.ledger.readAll();
      stopping = supervision.stop();
      const stopBeforeResumeReadReleased = await promiseSettlementWithin(stopping, 500);
      const countWhileResumeReadHeld = (await handle.ledger.readAll()).length;
      releaseResumeRead.resolve();
      const resumeOutcome = await resuming.then(
        () => "resolved" as const,
        () => "rejected" as const
      );
      await stopping;

      const afterStop = await handle.ledger.readAll();
      const lifecycleAfterStopBoundary = afterStop.slice(beforeStop.length).filter((event) =>
        event.type.startsWith("agent.wake.supervisor.")
      );
      expect({ stopBeforeResumeReadReleased, resumeOutcome }).toEqual({
        stopBeforeResumeReadReleased: "pending",
        resumeOutcome: "rejected"
      });
      expect(countWhileResumeReadHeld).toBe(beforeStop.length);
      expect(afterStop).toHaveLength(beforeStop.length);
      expect(lifecycleAfterStopBoundary).toHaveLength(0);
      await expect(supervision.snapshot()).rejects.toThrow("stopped");
      await expect(supervision.pause()).rejects.toThrow("stopped");
      await expect(supervision.resume()).rejects.toThrow("stopped");
    } finally {
      SQLiteEventLedger.prototype.readAll = originalReadAll;
      releaseActive.resolve();
      releaseResumeRead.resolve();
      await Promise.allSettled([pausing, resuming, stopping].filter(
        (promise): promise is Promise<unknown> => promise !== undefined
      ));
      await supervision?.stop().catch(() => undefined);
      handle.close();
    }
  });

  it("makes successful cancellation a quiescent fence before local effects and writes", async () => {
    const config = portableConfig("ws_running_cancel_fence");
    await seedMountedEvidenceTriageSource(config);
    const workspace = requireMountedWorkspace(config);
    const effectEntered = Promise.withResolvers<void>();
    const releaseEffect = Promise.withResolvers<void>();
    let didEnterEffect = false;
    const taskId = "task_running_cancel_fence";
    const runId = "run_running_cancel_fence";
    const handler = testHandler({
      config,
      mountedTaskBeforeLocalEffectForTest: async () => {
        didEnterEffect = true;
        effectEntered.resolve();
        await releaseEffect.promise;
      }
    });
    await createMountedEvidenceTriageTask(handler, taskId);
    const admitted = await handler({
      method: "POST",
      url: `/api/agent/tasks/${taskId}/evidence-triage`,
      body: JSON.stringify({
        runId,
        evidenceIds: ["ev_route_mounted_triage"],
        providerMode: "local-fake"
      })
    });
    expect(admitted.status, admitted.body).toBe(202);
    await effectEntered.promise;
    expect(didEnterEffect).toBe(true);
    const artifactStateAtFence = supervisionArtifactWriteState(workspace);

    let cancelSettled = false;
    const cancelResponse = handler({
      method: "POST",
      url: `/api/agent/tasks/${taskId}/cancel`
    }).then((response) => {
      cancelSettled = true;
      return response;
    });
    const canceledPrefix = await waitForAgentEvents(config, (events) => events.some((event) =>
      event.type === "agent.task.status.changed" && event.payload.taskId === taskId &&
      event.payload.status === "canceled"
    ));
    await Promise.resolve();
    await Promise.resolve();
    expect(cancelSettled).toBe(false);
    releaseEffect.resolve();

    const canceled = await cancelResponse;
    expect(canceled.status, canceled.body).toBe(200);
    expect(JSON.parse(canceled.body)).toMatchObject({
      task: { taskId, status: "canceled" }
    });
    const after = await allEvents(config);
    const canceledIndex = after.findIndex((event) => event.type === "agent.task.status.changed" &&
      event.payload.taskId === taskId && event.payload.status === "canceled");
    expect(canceledIndex).toBeGreaterThanOrEqual(canceledPrefix.length - 1);
    expect(after.slice(canceledIndex + 1).some((event) =>
      (event.type.startsWith("agent.model-invocation.") && Reflect.get(event.payload, "runId") === runId) ||
      (event.type.startsWith("agent.tool.") && Reflect.get(event.payload, "runId") === runId) ||
      (event.type === "agent.specialist-run.step.recorded" && event.payload.runId === runId) ||
      (event.type.startsWith("agent.specialist-handoff.") && Reflect.get(event.payload, "runId") === runId) ||
      (event.type === "agent.specialist-run.completed" && event.payload.runId === runId) ||
      (event.type === "agent.task.orchestration.completed" && event.payload.runId === runId) ||
      (event.type === "agent.memory.recorded" && event.payload.memoryId === `mem_${runId}_handoff`) ||
      (event.type === "agent.task.status.changed" && event.payload.taskId === taskId &&
        event.payload.status !== "canceled")
    )).toBe(false);
    expect(supervisionArtifactWriteState(workspace)).toEqual(artifactStateAtFence);
    expect((await handler({ method: "GET", url: "/api/agent/status" })).body)
      .toContain(`\"taskId\":\"${taskId}\"`);
    expect(JSON.parse((await handler({ method: "GET", url: "/api/agent/status" })).body).tasks)
      .toContainEqual(expect.objectContaining({ taskId, status: "canceled" }));
  });

  it("uses the durable canceled status as the effect fence across handler instances", async () => {
    const config = portableConfig("ws_cross_handler_cancel_fence");
    await seedMountedEvidenceTriageSource(config);
    const workspace = requireMountedWorkspace(config);
    const effectEntered = Promise.withResolvers<void>();
    const releaseEffect = Promise.withResolvers<void>();
    const taskId = "task_cross_handler_cancel_fence";
    const runId = "run_cross_handler_cancel_fence";
    const executor = testHandler({
      config,
      mountedTaskBeforeLocalEffectForTest: async () => {
        effectEntered.resolve();
        await releaseEffect.promise;
      }
    });
    await createMountedEvidenceTriageTask(executor, taskId);
    const admitted = await executor({
      method: "POST",
      url: `/api/agent/tasks/${taskId}/evidence-triage`,
      body: JSON.stringify({
        runId,
        evidenceIds: ["ev_route_mounted_triage"],
        providerMode: "local-fake"
      })
    });
    expect(admitted.status, admitted.body).toBe(202);
    await effectEntered.promise;
    const artifactStateAtFence = supervisionArtifactWriteState(workspace);

    const controller = testHandler({ config });
    const canceled = await controller({
      method: "POST",
      url: `/api/agent/tasks/${taskId}/cancel`
    });
    expect(canceled.status, canceled.body).toBe(200);
    releaseEffect.resolve();
    await closeHandler(executor);

    const events = await allEvents(config);
    const canceledIndex = events.findIndex((event) => event.type === "agent.task.status.changed" &&
      event.payload.taskId === taskId && event.payload.status === "canceled");
    expect(canceledIndex).toBeGreaterThanOrEqual(0);
    expect(events.slice(canceledIndex + 1).some((event) =>
      Reflect.get(event.payload, "runId") === runId && (
        event.type.startsWith("agent.model-invocation.") ||
        event.type.startsWith("agent.tool.") ||
        event.type === "agent.specialist-run.step.recorded" ||
        event.type.startsWith("agent.specialist-handoff.") ||
        event.type === "agent.specialist-run.completed" ||
        event.type === "agent.task.orchestration.completed" ||
        event.type === "agent.task.status.changed"
      ) || event.type === "agent.memory.recorded" &&
        event.payload.memoryId === `mem_${runId}_handoff`
    )).toBe(false);
    expect(supervisionArtifactWriteState(workspace)).toEqual(artifactStateAtFence);
    expect(JSON.parse((await controller({ method: "GET", url: "/api/agent/status" })).body).tasks)
      .toContainEqual(expect.objectContaining({ taskId, status: "canceled" }));
  });

  it("does not start a run when cancellation lands before the inner start snapshot", async () => {
    const config = portableConfig("ws_pre_start_snapshot_cancel_fence");
    await seedMountedEvidenceTriageSource(config);
    const workspace = requireMountedWorkspace(config);
    const snapshotBoundaryEntered = Promise.withResolvers<void>();
    const releaseSnapshot = Promise.withResolvers<void>();
    const taskId = "task_pre_start_snapshot_cancel_fence";
    const runId = "run_pre_start_snapshot_cancel_fence";
    const executor = testHandler({
      config,
      mountedTaskBeforeRunStartSnapshotForTest: async () => {
        snapshotBoundaryEntered.resolve();
        await releaseSnapshot.promise;
      }
    });
    await createMountedEvidenceTriageTask(executor, taskId);
    const admitted = await executor({
      method: "POST",
      url: `/api/agent/tasks/${taskId}/evidence-triage`,
      body: JSON.stringify({
        runId,
        evidenceIds: ["ev_route_mounted_triage"],
        providerMode: "local-fake"
      })
    });
    expect(admitted.status, admitted.body).toBe(202);
    await snapshotBoundaryEntered.promise;

    const controller = testHandler({
      config,
      residentBackgroundExecutionForTest: {
        async pendingLocalTasks() { return []; },
        async execute() { return; }
      }
    });
    const canceled = await controller({
      method: "POST",
      url: `/api/agent/tasks/${taskId}/cancel`
    });
    expect(canceled.status, canceled.body).toBe(200);
    expect(JSON.parse(canceled.body)).toMatchObject({
      task: { taskId, status: "canceled" }
    });
    const artifactStateAtCancel = supervisionArtifactWriteState(workspace);
    releaseSnapshot.resolve();
    await closeHandler(executor);

    const events = await allEvents(config);
    const canceledIndex = events.findIndex((event) => event.type === "agent.task.status.changed" &&
      event.payload.taskId === taskId && event.payload.status === "canceled");
    expect(canceledIndex).toBeGreaterThanOrEqual(0);
    expect(events.slice(canceledIndex + 1).some((event) =>
      event.type === "agent.specialist-run.started" && event.payload.runId === runId
    )).toBe(false);
    expect(events.slice(canceledIndex + 1).some((event) =>
      Reflect.get(event.payload, "runId") === runId && (
        event.type.startsWith("agent.model-invocation.") ||
        event.type.startsWith("agent.tool.") ||
        event.type === "agent.specialist-run.step.recorded" ||
        event.type.startsWith("agent.specialist-handoff.") ||
        event.type === "agent.specialist-run.completed" ||
        event.type === "agent.task.orchestration.completed" ||
        event.type === "agent.task.status.changed"
      ) || event.type === "agent.memory.recorded" &&
        event.payload.memoryId === `mem_${runId}_handoff`
    )).toBe(false);
    expect(supervisionArtifactWriteState(workspace)).toEqual(artifactStateAtCancel);
    expect(JSON.parse((await controller({ method: "GET", url: "/api/agent/status" })).body).tasks)
      .toContainEqual(expect.objectContaining({ taskId, status: "canceled" }));
  });

  it("keeps cancellation terminal when it lands between run-start and task-running", async () => {
    const config = portableConfig("ws_run_start_cancel_fence");
    await seedMountedEvidenceTriageSource(config);
    const workspace = requireMountedWorkspace(config);
    const startCommitted = Promise.withResolvers<void>();
    const releaseRunning = Promise.withResolvers<void>();
    const taskId = "task_run_start_cancel_fence";
    const runId = "run_run_start_cancel_fence";
    const executor = testHandler({
      config,
      mountedTaskBeforeTaskRunningForTest: async () => {
        startCommitted.resolve();
        await releaseRunning.promise;
      }
    });
    await createMountedEvidenceTriageTask(executor, taskId);
    const admitted = await executor({
      method: "POST",
      url: `/api/agent/tasks/${taskId}/evidence-triage`,
      body: JSON.stringify({
        runId,
        evidenceIds: ["ev_route_mounted_triage"],
        providerMode: "local-fake"
      })
    });
    expect(admitted.status, admitted.body).toBe(202);
    await startCommitted.promise;

    const controller = testHandler({ config });
    const canceled = await controller({
      method: "POST",
      url: `/api/agent/tasks/${taskId}/cancel`
    });
    expect(canceled.status, canceled.body).toBe(200);
    expect(JSON.parse(canceled.body)).toMatchObject({
      task: { taskId, status: "canceled" }
    });
    const artifactStateAtCancel = supervisionArtifactWriteState(workspace);
    releaseRunning.resolve();
    await closeHandler(executor);

    const events = await allEvents(config);
    const canceledIndex = events.findIndex((event) => event.type === "agent.task.status.changed" &&
      event.payload.taskId === taskId && event.payload.status === "canceled");
    expect(canceledIndex).toBeGreaterThanOrEqual(0);
    expect(events.slice(canceledIndex + 1).some((event) =>
      event.type === "agent.task.status.changed" && event.payload.taskId === taskId &&
      event.payload.status === "running"
    )).toBe(false);
    expect(events.slice(canceledIndex + 1).some((event) =>
      Reflect.get(event.payload, "runId") === runId && (
        event.type.startsWith("agent.model-invocation.") ||
        event.type.startsWith("agent.tool.") ||
        event.type === "agent.specialist-run.step.recorded" ||
        event.type.startsWith("agent.specialist-handoff.") ||
        event.type === "agent.specialist-run.completed" ||
        event.type === "agent.task.orchestration.completed" ||
        event.type === "agent.task.status.changed"
      ) || event.type === "agent.memory.recorded" &&
        event.payload.memoryId === `mem_${runId}_handoff`
    )).toBe(false);
    expect(supervisionArtifactWriteState(workspace)).toEqual(artifactStateAtCancel);
    expect(JSON.parse((await controller({ method: "GET", url: "/api/agent/status" })).body).tasks)
      .toContainEqual(expect.objectContaining({ taskId, status: "canceled" }));
  });

  it("resumes an exact run-start and queued-task prefix after restart", async () => {
    const config = portableConfig("ws_run_start_queued_restart");
    await seedMountedEvidenceTriageSource(config);
    const startCommitted = Promise.withResolvers<void>();
    const releaseCrash = Promise.withResolvers<void>();
    const taskId = "task_run_start_queued_restart";
    const runId = "run_run_start_queued_restart";
    const first = testHandler({
      config,
      mountedTaskBeforeTaskRunningForTest: async () => {
        startCommitted.resolve();
        await releaseCrash.promise;
        throw new Error("Simulated service loss after durable run start.");
      }
    });
    await createMountedEvidenceTriageTask(first, taskId);
    const admitted = await first({
      method: "POST",
      url: `/api/agent/tasks/${taskId}/evidence-triage`,
      body: JSON.stringify({
        runId,
        evidenceIds: ["ev_route_mounted_triage"],
        providerMode: "local-fake"
      })
    });
    expect(admitted.status, admitted.body).toBe(202);
    await startCommitted.promise;
    const closing = closeHandler(first);
    releaseCrash.resolve();
    await closing;

    const prefix = await allEvents(config);
    expect(prefix.filter((event) =>
      event.type === "agent.specialist-run.started" && event.payload.runId === runId
    )).toHaveLength(1);
    const prefixTaskStatuses = prefix.filter((event): event is KnowledgeEventOf<"agent.task.status.changed"> =>
      event.type === "agent.task.status.changed" && event.payload.taskId === taskId
    ).map((event) => event.payload.status);
    expect(prefixTaskStatuses.at(-1)).toBe("queued");
    expect(prefixTaskStatuses).not.toContain("running");

    const restarted = testHandler({ config, now: () => "2026-07-07T20:06:00.000Z" });
    const recovered = await waitForMountedTaskResult(
      restarted,
      `/api/agent/tasks/${taskId}/evidence-triage/${runId}`
    );
    expect(recovered.status, recovered.body).toBe(200);
    expect(JSON.parse(recovered.body)).toMatchObject({
      state: "completed",
      taskId,
      runId,
      memoryId: `mem_${runId}_handoff`
    });
    const events = await allEvents(config);
    expect(events.filter((event) =>
      event.type === "agent.specialist-run.started" && event.payload.runId === runId
    )).toHaveLength(1);
    expect(events.filter((event) =>
      event.type === "agent.task.status.changed" && event.payload.taskId === taskId &&
      event.payload.status === "running"
    )).toHaveLength(1);
    expect(events.filter((event) =>
      event.type === "agent.model-invocation.requested" && event.payload.runId === runId
    )).toHaveLength(1);
  });

  it("offers retry only for a durable retryable failure and appends a human retry policy event", async () => {
    const config = portableConfig("ws_supervision_retry");
    const handler = testHandler({ config });
    await createMountedEvidenceTriageTask(handler, "task_supervision_retry");
    await seedRetryableTaskFailure(config, "task_supervision_retry");

    const cockpit = await handler({ method: "GET", url: "/api/agent/cockpit" });
    expect(cockpit.status, cockpit.body).toBe(200);
    expect(JSON.parse(cockpit.body)).toMatchObject({
      supervision: {
        controls: expect.arrayContaining([
          expect.objectContaining({
            action: "retry",
            enabled: true,
            taskId: "task_supervision_retry"
          })
        ])
      }
    });

    const retried = await handler({
      method: "POST",
      url: "/api/agent/tasks/task_supervision_retry/retry"
    });
    expect(retried.status, retried.body).toBe(200);
    expect(JSON.parse(retried.body)).toMatchObject({
      task: { taskId: "task_supervision_retry", status: "queued" },
      supervision: { workspaceState: "available" }
    });
    const retryPolicy = (await allEvents(config)).findLast((event) =>
      event.type === "agent.task.status.changed" &&
      event.payload.taskId === "task_supervision_retry"
    );
    expect(retryPolicy).toMatchObject({
      type: "agent.task.status.changed",
      context: { actor: { id: "actor_agent_route", kind: "human" } },
      payload: {
        status: "queued",
        changedBy: "actor_agent_route",
        reason: "Human requested a retry."
      }
    });
  });

  it("returns workspace-unavailable with zero ledger or artifact writes after the portable mount disconnects", async () => {
    const config = portableConfig("ws_supervision_disconnected");
    const handler = testHandler({ config });
    const workspace = requireMountedWorkspace(config);
    const admitted = await handler({ method: "GET", url: "/api/agent/cockpit" });
    expect(admitted.status, admitted.body).toBe(200);
    expect(JSON.parse(admitted.body)).toMatchObject({
      supervision: { supervisorState: "running", workspaceState: "available" }
    });
    const beforeEvents = await allEvents(config);
    const derivativeEntriesBefore = supervisionArtifactWriteState(workspace);
    const disconnectedManifestPath = `${workspace.manifestPath}.disconnected`;
    renameSync(workspace.manifestPath, disconnectedManifestPath);

    const createBlocked = await handler({
      method: "POST",
      url: "/api/agent/tasks",
      body: JSON.stringify({
        taskId: "task_must_not_be_written",
        title: "Do not write after disconnect",
        priority: "normal"
      })
    });
    const pauseBlocked = await handler({ method: "POST", url: "/api/agent/supervision/pause" });
    const unavailableCockpit = await handler({ method: "GET", url: "/api/agent/cockpit" });

    expect(createBlocked.status, createBlocked.body).toBe(409);
    expect(pauseBlocked.status, pauseBlocked.body).toBe(409);
    expect(JSON.parse(createBlocked.body)).toMatchObject({
      ok: false,
      diagnostic: {
        category: "workspace-unavailable",
        allowedRepairActions: ["reconnect the same portable workspace", "refresh agent status"]
      }
    });
    expect(JSON.parse(pauseBlocked.body)).toMatchObject({
      ok: false,
      diagnostic: { category: "workspace-unavailable" }
    });
    expect(unavailableCockpit.status, unavailableCockpit.body).toBe(200);
    expect(JSON.parse(unavailableCockpit.body)).toMatchObject({
      supervision: {
        supervisorState: "workspace-unavailable",
        workspaceState: "unavailable",
        controls: expect.arrayContaining([
          expect.objectContaining({ action: "pause", enabled: false }),
          expect.objectContaining({ action: "resume", enabled: false })
        ])
      }
    });
    expect(await allEvents(config)).toEqual(beforeEvents);
    expect(supervisionArtifactWriteState(workspace)).toEqual(derivativeEntriesBefore);

    renameSync(disconnectedManifestPath, workspace.manifestPath);
    const reconnectedCockpit = await handler({ method: "GET", url: "/api/agent/cockpit" });
    expect(reconnectedCockpit.status, reconnectedCockpit.body).toBe(200);
    expect(JSON.parse(reconnectedCockpit.body)).toMatchObject({
      supervision: {
        supervisorState: "paused",
        workspaceState: "available",
        controls: expect.arrayContaining([
          expect.objectContaining({ action: "resume", enabled: true })
        ])
      }
    });
    const recovered = await handler({ method: "POST", url: "/api/agent/supervision/resume" });
    expect(recovered.status, recovered.body).toBe(200);
    expect(JSON.parse(recovered.body)).toMatchObject({
      supervision: { supervisorState: "running", workspaceState: "available" }
    });
    expect((await allEvents(config)).some((event) =>
      event.type === "agent.wake.supervisor.recovery.verified.v1"
    )).toBe(true);

    const sameIdentityManifest = readFileSync(workspace.manifestPath, "utf8");
    rewriteWorkspaceManifest(workspace.manifestPath, { workspaceId: "ws_different_supervision" });
    const beforeMismatch = await allEvents(config);
    const mismatchedCockpit = await handler({ method: "GET", url: "/api/agent/cockpit" });
    const mismatchedResume = await handler({ method: "POST", url: "/api/agent/supervision/resume" });
    expect(mismatchedCockpit.status, mismatchedCockpit.body).toBe(200);
    expect(JSON.parse(mismatchedCockpit.body)).toMatchObject({
      supervision: { supervisorState: "workspace-unavailable", workspaceState: "identity-mismatch" }
    });
    expect(mismatchedResume.status, mismatchedResume.body).toBe(409);
    expect(JSON.parse(mismatchedResume.body)).toMatchObject({
      diagnostic: { category: "workspace-identity-mismatch" }
    });
    expect(await allEvents(config)).toEqual(beforeMismatch);
    writeFileSync(workspace.manifestPath, sameIdentityManifest);
    expect(supervisionArtifactWriteState(workspace)).toEqual(derivativeEntriesBefore);
  });

  it("rolls back task control when the portable mount disconnects immediately before commit", async () => {
    const config = portableConfig("ws_task_control_precommit_disconnect");
    const handler = testHandler({ config, agentRuntimeFactory: contextFreeLocalAgentRuntimeFactory });
    const workspace = requireMountedWorkspace(config);
    const created = await handler({
      method: "POST",
      url: "/api/agent/tasks",
      body: JSON.stringify({
        taskId: "task_control_precommit_disconnect",
        title: "Keep task control current",
        priority: "normal"
      })
    });
    expect(created.status, created.body).toBe(200);

    const disconnectedManifestPath = `${workspace.manifestPath}.precommit-disconnected`;
    const disconnectBeforeCommit = (event: Parameters<SQLiteEventLedger["append"]>[0]) => {
      if (
        event.type === "agent.task.status.changed" &&
        event.payload.taskId === "task_control_precommit_disconnect" &&
        event.payload.status === "canceled" &&
        existsSync(workspace.manifestPath)
      ) {
        renameSync(workspace.manifestPath, disconnectedManifestPath);
      }
    };
    const originalAppend = SQLiteEventLedger.prototype.append;
    SQLiteEventLedger.prototype.append = async function (event, options) {
      disconnectBeforeCommit(event);
      return await originalAppend.call(this, event, options);
    };
    const originalGuardedAppend = SQLiteEventLedger.prototype.appendWithPrecommitGuard;
    SQLiteEventLedger.prototype.appendWithPrecommitGuard = async function (event, options, guard) {
      disconnectBeforeCommit(event);
      return await originalGuardedAppend.call(this, event, options, guard);
    };

    try {
      const canceled = await handler({
        method: "POST",
        url: "/api/agent/tasks/task_control_precommit_disconnect/cancel"
      });
      const canceledStatusEvents = (await allEvents(config)).filter((event) =>
        event.type === "agent.task.status.changed" &&
        event.payload.taskId === "task_control_precommit_disconnect" &&
        event.payload.status === "canceled"
      );

      expect(canceled.status, canceled.body).toBe(409);
      expect(JSON.parse(canceled.body)).toMatchObject({
        ok: false,
        diagnostic: { category: "workspace-unavailable" }
      });
      expect(canceledStatusEvents).toHaveLength(0);
    } finally {
      SQLiteEventLedger.prototype.append = originalAppend;
      SQLiteEventLedger.prototype.appendWithPrecommitGuard = originalGuardedAppend;
      if (existsSync(disconnectedManifestPath)) {
        renameSync(disconnectedManifestPath, workspace.manifestPath);
      }
    }
  });

  it("does not admit or dispatch mounted work when the portable mount disconnects at admission precommit", async () => {
    const config = portableConfig("ws_mounted_admission_precommit_disconnect");
    await seedMountedEvidenceTriageSource(config);
    const workspace = requireMountedWorkspace(config);
    const disconnectedManifestPath = `${workspace.manifestPath}.admission-precommit-disconnected`;
    let disconnected = false;
    const handler = testHandler({
      config,
      mountedTaskAdmissionPrecommitForTest() {
        if (!disconnected && existsSync(workspace.manifestPath)) {
          renameSync(workspace.manifestPath, disconnectedManifestPath);
          disconnected = true;
        }
      }
    });
    await createMountedEvidenceTriageTask(handler, "task_mounted_admission_precommit_disconnect");

    let response;
    try {
      response = await handler({
        method: "POST",
        url: "/api/agent/tasks/task_mounted_admission_precommit_disconnect/evidence-triage",
        body: JSON.stringify({
          runId: "run_mounted_admission_precommit_disconnect",
          evidenceIds: ["ev_route_mounted_triage"],
          providerMode: "local-fake"
        })
      });
    } finally {
      if (existsSync(disconnectedManifestPath)) {
        renameSync(disconnectedManifestPath, workspace.manifestPath);
      }
    }

    expect(response?.status, response?.body).toBe(409);
    const events = await allEvents(config);
    expect(events.filter((event) =>
      event.type === "agent.mounted-task.execution.admitted.v1" &&
      event.payload.taskId === "task_mounted_admission_precommit_disconnect"
    )).toHaveLength(0);
    expect(events.map((event) => event.type)).not.toEqual(expect.arrayContaining([
      "agent.specialist-run.started",
      "agent.model-invocation.requested",
      "agent.model-invocation.completed",
      "agent.specialist-handoff.prepared",
      "agent.specialist-handoff.recorded",
      "agent.memory.recorded"
    ]));
  });

  it("completes and reconstructs a mounted local evidence-triage task through production routes", async () => {
    const config = clonedCompletedMountedTaskConfig();
    const sourceEventIds = completedMountedTaskFixture?.sourceEventIds;
    if (sourceEventIds === undefined) throw new Error("Completed mounted task fixture is unavailable.");
    const first = testHandler({ config });
    const executed = await first({
      method: "GET",
      url: "/api/agent/tasks/task_route_mounted_triage/evidence-triage/run_route_mounted_triage"
    });
    const completed = JSON.parse(executed.body) as {
      readonly schemaVersion: string;
      readonly state: string;
      readonly residentAgentId: string;
      readonly taskId: string;
      readonly runId: string;
      readonly contextBindings: readonly { readonly contentHash: string }[];
      readonly promptArtifactHash: string;
      readonly handoff: {
        readonly status: string;
        readonly manifestHash: string;
        readonly outputArtifactHashes: readonly string[];
        readonly sourceEventIds: readonly string[];
        readonly policyHash: string;
      };
      readonly memoryId: string;
    };

    expect(executed.status, executed.body).toBe(200);
    expect(completed).toMatchObject({
      schemaVersion: "agent-mounted-task-result.v1",
      state: "completed",
      residentAgentId: "agent_default",
      taskId: "task_route_mounted_triage",
      runId: "run_route_mounted_triage",
      handoff: { status: "ready-for-review" },
      memoryId: "mem_run_route_mounted_triage_handoff"
    });
    expect(completed.contextBindings.length).toBeGreaterThan(0);
    expect(completed.contextBindings.every((binding) => /^sha256:[a-f0-9]{64}$/.test(binding.contentHash))).toBe(true);
    expect(completed.promptArtifactHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(completed.handoff.manifestHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(completed.handoff.policyHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(completed.handoff.outputArtifactHashes).toHaveLength(6);
    expect(completed.handoff.sourceEventIds).toEqual(sourceEventIds);

    await closeHandler(first);
    const second = testHandler({ config });
    const reconstructed = await second({
      method: "GET",
      url: "/api/agent/tasks/task_route_mounted_triage/evidence-triage/run_route_mounted_triage"
    });
    const status = await second({ method: "GET", url: "/api/agent/status" });
    const cockpit = await second({ method: "GET", url: "/api/agent/cockpit" });

    expect(reconstructed.status).toBe(200);
    expect(JSON.parse(reconstructed.body)).toEqual(completed);
    expect(cockpit.status, cockpit.body).toBe(200);
    expect(JSON.parse(cockpit.body)).toMatchObject({
      selectedRun: {
        runId: "run_route_mounted_triage",
        taskId: "task_route_mounted_triage",
        planHistory: expect.any(Array),
        observationHistory: expect.any(Array),
        handoff: {
          schemaVersion: "agent-specialist-handoff.v1",
          runId: "run_route_mounted_triage",
          taskId: "task_route_mounted_triage",
          status: "ready-for-review",
          outputArtifacts: expect.arrayContaining([
            expect.objectContaining({ artifactHash: completed.handoff.outputArtifactHashes[0] })
          ])
        }
      }
    });
    const resident = JSON.parse(status.body) as {
      readonly identity: { readonly residentAgentId: string };
      readonly tasks: readonly { readonly taskId: string }[];
      readonly runs: readonly { readonly runId: string; readonly state: string }[];
      readonly activeMemory: readonly { readonly memoryId: string }[];
    };
    expect(resident.identity.residentAgentId).toBe("agent_default");
    expect(resident.tasks.filter((task) => task.taskId === "task_route_mounted_triage")).toHaveLength(1);
    expect(resident.runs).toContainEqual(expect.objectContaining({
      runId: "run_route_mounted_triage",
      state: "completed"
    }));
    expect(resident.activeMemory).toContainEqual(expect.objectContaining({
      memoryId: "mem_run_route_mounted_triage_handoff"
    }));
    const completedEvents = await allEvents(config);
    const recorded = completedEvents.find((event) =>
      event.type === "agent.specialist-handoff.recorded" && event.payload.runId === "run_route_mounted_triage"
    );
    const memory = completedEvents.find((event) =>
      event.type === "agent.memory.recorded" && event.payload.memoryId === "mem_run_route_mounted_triage_handoff"
    );
    expect(recorded?.type === "agent.specialist-handoff.recorded" &&
      "manifestSchemaVersion" in recorded.payload
      ? recorded.payload.manifestSchemaVersion
      : undefined).toBe("agent-specialist-handoff-manifest.v2");
    expect(memory?.context.actor).toMatchObject({ id: "agent_default", kind: "agent" });

    await closeHandler(second);
    rewriteWorkspaceManifest(requireMountedWorkspace(config).manifestPath, { label: "Changed before fresh readback" });
    const staleFreshProcess = testHandler({ config });
    const staleReadback = await staleFreshProcess({
      method: "GET",
      url: "/api/agent/tasks/task_route_mounted_triage/evidence-triage/run_route_mounted_triage"
    });
    expect(staleReadback.status).toBe(409);
    expect(staleReadback.body).not.toContain(requireMountedWorkspace(config).rootDir);
  });

  it("suspends a mounted remote evidence-triage task for provider-byte-transfer approval without invoking a provider", async () => {
    const config = portableConfig("ws_mounted_remote_triage");
    await seedMountedEvidenceTriageSource(config);
    const first = testHandler({ config });
    await createMountedEvidenceTriageTask(first, "task_route_mounted_remote");

    const executed = await first({
      method: "POST",
      url: "/api/agent/tasks/task_route_mounted_remote/evidence-triage",
      body: JSON.stringify({
        runId: "run_route_mounted_remote",
        evidenceIds: ["ev_route_mounted_triage"],
        providerMode: "remote-gated"
      })
    });
    const waiting = JSON.parse(executed.body) as {
      readonly state: string;
      readonly contextBindings: readonly { readonly contentHash: string }[];
      readonly promptArtifactHash: string;
      readonly approval: {
        readonly toolRequestId: string;
        readonly requiredApprovalClass: string;
        readonly previewHash: string;
      };
    };

    expect(executed.status, executed.body).toBe(200);
    expect(waiting).toMatchObject({
      state: "waiting-for-approval",
      approval: {
        toolRequestId: "toolreq_run_route_mounted_remote_provider_transfer",
        requiredApprovalClass: "provider-byte-transfer"
      }
    });
    expect(waiting.contextBindings.length).toBeGreaterThan(0);
    expect(waiting.promptArtifactHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(waiting.approval.previewHash).toMatch(/^sha256:[a-f0-9]{64}$/);

    await closeHandler(first);
    let markBackgroundScanObserved: (taskCount: number) => void = () => undefined;
    const backgroundScanObserved = new Promise<number>((resolve) => {
      markBackgroundScanObserved = resolve;
    });
    const second = testHandler({
      config,
      mountedTaskBackgroundScanForTest: markBackgroundScanObserved
    });
    expect(await backgroundScanObserved).toBe(0);
    const status = await second({ method: "GET", url: "/api/agent/status" });
    const approvals = await second({ method: "GET", url: "/api/agent/approvals" });
    const statusBody = JSON.parse(status.body) as {
      readonly tasks: readonly { readonly taskId: string; readonly status: string }[];
      readonly runs: readonly { readonly runId: string; readonly state: string }[];
      readonly toolRequests: readonly {
        readonly toolRequestId: string;
        readonly state: string;
        readonly requiredApprovalClass: string;
      }[];
    };
    expect(statusBody.tasks).toContainEqual(expect.objectContaining({
      taskId: "task_route_mounted_remote",
      status: "waiting-for-approval"
    }));
    expect(statusBody.runs).toContainEqual(expect.objectContaining({
      runId: "run_route_mounted_remote",
      state: "running"
    }));
    expect(statusBody.toolRequests).toContainEqual(expect.objectContaining({
      toolRequestId: waiting.approval.toolRequestId,
      state: "requested",
      requiredApprovalClass: "provider-byte-transfer"
    }));
    expect(JSON.parse(approvals.body)).toMatchObject({ summary: { pendingCount: 1 } });

    const events = await allEvents(config);
    expect(events.filter((event) =>
      event.type === "agent.mounted-task.execution.admitted.v1" &&
      event.payload.taskId === "task_route_mounted_remote" &&
      event.payload.runId === "run_route_mounted_remote" &&
      event.payload.providerMode === "remote-gated"
    )).toHaveLength(1);
    expect(events.filter((event) =>
      event.type === "agent.tool.requested" &&
      event.payload.toolRequestId === waiting.approval.toolRequestId
    )).toHaveLength(1);
    expect(events.map((event) => event.type)).not.toEqual(expect.arrayContaining([
      "agent.model-invocation.requested",
      "agent.model-invocation.completed",
      "agent.specialist-handoff.recorded",
      "agent.memory.recorded"
    ]));
    const serializedSurface = JSON.stringify({ waiting, status: statusBody, approvals: JSON.parse(approvals.body), events });
    expect(serializedSurface).not.toContain("bounded mounted evidence triage fixture");
    expect(serializedSurface).not.toContain("raw-provider-error-sentinel");
    expect(serializedSurface).not.toContain(requireMountedWorkspace(config).rootDir);
  });

  it("uses one authoritative context snapshot when the production clock advances", async () => {
    const config = clonedCompletedMountedTaskConfig();
    const handler = testHandler({ config });
    const response = await handler({
      method: "GET",
      url: `/api/agent/tasks/${completedFixtureTaskId}/evidence-triage/${completedFixtureRunId}`
    });
    expect(response.status, response.body).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({ state: "completed" });
  });

  it("fails before downstream effects when the installed resident policy excludes evidence triage", async () => {
    const config = portableConfig("ws_mounted_policy_excludes_triage");
    await seedMountedEvidenceTriageSource(config);
    const first = testHandler({ config });
    await createMountedEvidenceTriageTask(first, "task_route_mounted_policy_excludes_triage");
    await closeHandler(first);

    const ledger = new SQLiteEventLedger(config.storage.sqlitePath);
    try {
      await ledger.append({
        type: "agent.policy.installed",
        version: 1,
        streamId: "agent_policy_agent_policy_default",
        context: {
          actor: { id: "actor_policy_reviewer", kind: "human", label: "Policy reviewer" },
          occurredAt: "2026-07-07T19:59:00.000Z",
          correlationId: "corr_mounted_policy_excludes_triage",
          coreVersion: "0.1.0",
          packVersions: { core: "0.1.0", agent: "0.1.0" }
        },
        payload: {
          policyId: "agent_policy_default",
          residentAgentId: "agent_default",
          version: "review-deny-evidence-triage",
          installedBy: "actor_policy_reviewer",
          humanGatedActionClasses: ["external-byte-transfer"],
          allowedRunTypes: ["timeline-builder"],
          credentialKinds: ["local-no-secret"],
          rationale: "Evidence triage is excluded from the reviewed resident policy."
        }
      } satisfies AppendableKnowledgeEvent<"agent.policy.installed">);
    } finally {
      ledger.close();
    }
    const idsBefore = (await allEvents(config)).map((event) => event.id);
    const fresh = testHandler({ config });

    const response = await fresh({
      method: "POST",
      url: "/api/agent/tasks/task_route_mounted_policy_excludes_triage/evidence-triage",
      body: JSON.stringify({
        runId: "run_route_mounted_policy_excludes_triage",
        evidenceIds: ["ev_route_mounted_triage"],
        providerMode: "local-fake"
      })
    });

    expect(response.status, response.body).toBe(409);
    expect((await allEvents(config)).map((event) => event.id)).toEqual(idsBefore);
  });

  it("rejects a completed-run replay when the submitted evidence order changes", async () => {
    const config = clonedCompletedMountedTaskConfig();
    const handler = testHandler({ config });
    const idsBefore = (await allEvents(config)).map((event) => event.id);

    const reordered = await handler({
      method: "POST",
      url: `/api/agent/tasks/${completedFixtureTaskId}/evidence-triage`,
      body: JSON.stringify({
        runId: completedFixtureRunId,
        evidenceIds: ["ev_route_mounted_triage_second", "ev_route_mounted_triage"],
        providerMode: "local-fake"
      })
    });

    expect(reordered.status, reordered.body).toBe(409);
    expect((await allEvents(config)).map((event) => event.id)).toEqual(idsBefore);
  });

  it("keeps the effective installed policy version after a label-only identity update", async () => {
    const config = clonedCompletedMountedTaskConfig();
    const fresh = testHandler({ config });
    const response = await fresh({
      method: "GET",
      url: `/api/agent/tasks/${completedFixtureTaskId}/evidence-triage/${completedFixtureRunId}`
    });
    expect(response.status, response.body).toBe(200);
    const body = JSON.parse(response.body) as { readonly promptArtifactHash: `sha256:${string}` };
    const prompt = JSON.parse(readMountedPromptArtifact(config, body.promptArtifactHash)) as {
      readonly manifest: {
        readonly contextPackRefs: readonly { readonly policyVersion?: string }[];
      };
    };
    expect(prompt.manifest.contextPackRefs.map((ref) => ref.policyVersion))
      .toEqual(expect.arrayContaining(["installed-policy-v77"]));
    expect(prompt.manifest.contextPackRefs.map((ref) => ref.policyVersion))
      .not.toContain("agent-identity-policy-update.v1");
  });

  it("rejects a second run for a terminal task without appending or changing terminal state", async () => {
    const config = clonedCompletedMountedTaskConfig();
    const handler = testHandler({ config });
    const idsBefore = (await allEvents(config)).map((event) => event.id);

    const replay = await handler({
      method: "POST",
      url: `/api/agent/tasks/${completedFixtureTaskId}/evidence-triage`,
      body: JSON.stringify({
        runId: "run_route_mounted_terminal_replay_remote",
        evidenceIds: ["ev_route_mounted_triage"],
        providerMode: "remote-gated"
      })
    });
    const status = await handler({ method: "GET", url: "/api/agent/status" });

    expect(replay.status, replay.body).toBe(409);
    expect((await allEvents(config)).map((event) => event.id)).toEqual(idsBefore);
    expect(JSON.parse(status.body).tasks).toContainEqual(expect.objectContaining({
      taskId: completedFixtureTaskId,
      status: "completed"
    }));
  });

  it("does not place another task's task-scoped memory into the mounted prompt", async () => {
    const config = portableConfig("ws_mounted_task_memory_isolation");
    await seedMountedEvidenceTriageSource(config);
    const handler = testHandler({ config });
    const alpha = await handler({
      method: "POST",
      url: "/api/agent/tasks",
      body: JSON.stringify({
        taskId: "task_route_mounted_memory_alpha",
        title: "Alpha task",
        priority: "normal",
        description: "Task-scoped memory source."
      })
    });
    expect(alpha.status, alpha.body).toBe(200);
    const alphaBody = JSON.parse(alpha.body) as { readonly eventIds: readonly string[] };
    const sentinel = "ALPHA_TASK_ONLY_MEMORY_SENTINEL";
    const memory = await handler({
      method: "POST",
      url: "/api/agent/memory",
      body: JSON.stringify({
        memoryId: "mem_review_alpha_private",
        scope: "task",
        memoryKind: "agent-observation",
        summary: sentinel,
        sourceEventIds: [alphaBody.eventIds[0]],
        confidence: 1
      })
    });
    expect(memory.status, memory.body).toBe(200);
    await createMountedEvidenceTriageTask(handler, "task_route_mounted_memory_beta");
    const eventCountBeforeBetaRun = (await allEvents(config)).length;

    const beta = await handler({
      method: "POST",
      url: "/api/agent/tasks/task_route_mounted_memory_beta/evidence-triage",
      body: JSON.stringify({
        runId: "run_route_mounted_memory_beta",
        evidenceIds: ["ev_route_mounted_triage"],
        providerMode: "remote-gated"
      })
    });
    expect(beta.status, beta.body).toBe(200);
    const betaBody = JSON.parse(beta.body) as { readonly promptArtifactHash: `sha256:${string}` };

    expect(readMountedPromptArtifact(config, betaBody.promptArtifactHash)).not.toContain(sentinel);
    expect(JSON.stringify((await allEvents(config)).slice(eventCountBeforeBetaRun))).not.toContain(sentinel);
  });

  it("includes human-accepted graph truth and exact acceptance provenance in the mounted prompt", async () => {
    const config = portableConfig("ws_mounted_accepted_graph_context");
    await seedMountedEvidenceTriageSource(config);
    const { assertionId, acceptedEventId } = await seedMountedAcceptedAssertion(config);
    const handler = testHandler({ config });
    await createMountedEvidenceTriageTask(handler, "task_route_mounted_accepted_graph_context");

    const response = await handler({
      method: "POST",
      url: "/api/agent/tasks/task_route_mounted_accepted_graph_context/evidence-triage",
      body: JSON.stringify({
        runId: "run_route_mounted_accepted_graph_context",
        evidenceIds: ["ev_route_mounted_triage"],
        providerMode: "remote-gated"
      })
    });
    expect(response.status, response.body).toBe(200);
    const body = JSON.parse(response.body) as { readonly promptArtifactHash: `sha256:${string}` };
    const prompt = readMountedPromptArtifact(config, body.promptArtifactHash);

    expect(prompt).toContain(assertionId);
    expect(prompt).toContain(acceptedEventId);
  });

  it("includes an active governance restriction and its exact projection provenance in the mounted prompt", async () => {
    const config = portableConfig("ws_mounted_governance_restriction_context");
    await seedMountedEvidenceTriageSource(config);
    const { quarantineId, quarantineEventId } = await seedMountedGovernanceRestriction(config);
    const handler = testHandler({ config });
    await createMountedEvidenceTriageTask(handler, "task_route_mounted_governance_restriction");

    const response = await handler({
      method: "POST",
      url: "/api/agent/tasks/task_route_mounted_governance_restriction/evidence-triage",
      body: JSON.stringify({
        runId: "run_route_mounted_governance_restriction",
        evidenceIds: ["ev_route_mounted_triage"],
        providerMode: "remote-gated"
      })
    });
    expect(response.status, response.body).toBe(200);
    const body = JSON.parse(response.body) as { readonly promptArtifactHash: `sha256:${string}` };
    const prompt = readMountedPromptArtifact(config, body.promptArtifactHash);

    expect(prompt).toContain(quarantineId);
    expect(prompt).toContain(quarantineEventId);
  });

  it("writes the authority-bound handoff manifest to its canonical mounted manifest store", async () => {
    const config = clonedCompletedMountedTaskConfig();
    const handler = testHandler({ config });
    const response = await handler({
      method: "GET",
      url: `/api/agent/tasks/${completedFixtureTaskId}/evidence-triage/${completedFixtureRunId}`
    });
    expect(response.status, response.body).toBe(200);
    const body = JSON.parse(response.body) as {
      readonly handoff: { readonly manifestHash: `sha256:${string}` };
    };
    const manifestStore = new FileBlobStore(join(
      requireMountedWorkspace(config).paths.derivativeRoot,
      "specialist-handoff-manifest"
    ));

    await expect(manifestStore.get(body.handoff.manifestHash)).resolves.toBeInstanceOf(Buffer);
  });

  it("reconstructs one waiting run and makes its identical POST idempotent after restart", async () => {
    const config = portableConfig("ws_mounted_waiting_restart");
    await seedMountedEvidenceTriageSource(config);
    const first = testHandler({ config });
    const taskId = "task_route_mounted_waiting_restart";
    const runId = "run_route_mounted_waiting_restart";
    await createMountedEvidenceTriageTask(first, taskId);
    const initial = await first({
      method: "POST",
      url: `/api/agent/tasks/${taskId}/evidence-triage`,
      body: JSON.stringify({
        runId,
        evidenceIds: ["ev_route_mounted_triage"],
        providerMode: "remote-gated"
      })
    });
    expect(initial.status, initial.body).toBe(200);
    const initialIds = (await allEvents(config)).map((event) => event.id);
    await closeHandler(first);
    const fresh = testHandler({ config });

    const readback = await fresh({
      method: "GET",
      url: `/api/agent/tasks/${taskId}/evidence-triage/${runId}`
    });
    const repeated = await fresh({
      method: "POST",
      url: `/api/agent/tasks/${taskId}/evidence-triage`,
      body: JSON.stringify({
        runId,
        evidenceIds: ["ev_route_mounted_triage"],
        providerMode: "remote-gated"
      })
    });

    expect(readback.status, readback.body).toBe(200);
    expect(readback.body).toBe(initial.body);
    expect(repeated.status, repeated.body).toBe(200);
    expect(repeated.body).toBe(initial.body);
    expect((await allEvents(config)).map((event) => event.id)).toEqual(initialIds);
  });

  it("fails closed before provider invocation or mounted task artifact writes for invalid workspace authority", async () => {
    const cases = ["missing", "source-bytes-missing", "disconnected", "identity-mismatched", "stale", "locked"] as const;
    for (const authorityCase of cases) {
      const config = portableConfig(`ws_mounted_fail_${authorityCase.replace("-", "_")}`);
      if (authorityCase !== "missing") await seedMountedEvidenceTriageSource(config);
      const workspace = requireMountedWorkspace(config);
      const handler = testHandler({ config });
      const taskId = `task_route_mounted_fail_${authorityCase.replace("-", "_")}`;
      const runId = `run_route_mounted_fail_${authorityCase.replace("-", "_")}`;
      await createMountedEvidenceTriageTask(handler, taskId);

      if (authorityCase === "disconnected") {
        renameSync(workspace.manifestPath, `${workspace.manifestPath}.disconnected`);
      } else if (authorityCase === "source-bytes-missing") {
        await removeMountedEvidenceSourceBytes(config);
      } else if (authorityCase === "identity-mismatched") {
        rewriteWorkspaceManifest(workspace.manifestPath, { workspaceId: "ws_unexpected_mounted_identity" });
      } else if (authorityCase === "stale") {
        rewriteWorkspaceManifest(workspace.manifestPath, { label: "Changed after runtime capture" });
      } else if (authorityCase === "locked") {
        await seedActiveMountedTaskLock(config);
      }

      const response = await handler({
        method: "POST",
        url: `/api/agent/tasks/${taskId}/evidence-triage`,
        body: JSON.stringify({
          runId,
          evidenceIds: ["ev_route_mounted_triage"],
          providerMode: "local-fake"
        })
      });

      expect(response.status, `${authorityCase}: ${response.body}`).toBe(409);
      expect(response.body).not.toContain(workspace.rootDir);
      expect(response.body).not.toContain("bounded mounted evidence triage fixture");
      const events = await allEvents(config);
      expect(events.map((event) => event.type)).not.toEqual(expect.arrayContaining([
        "agent.specialist-run.started",
        "agent.model-invocation.requested",
        "agent.model-invocation.completed",
        "agent.specialist-handoff.prepared",
        "agent.specialist-handoff.recorded",
        "agent.memory.recorded"
      ]));
      expect(existsSync(join(workspace.paths.blobRoot, "agent-prompt-artifacts"))).toBe(false);
      expect(existsSync(join(workspace.paths.derivativeRoot, "resident-agent-mounted-task"))).toBe(false);
      expect(existsSync(join(workspace.paths.derivativeRoot, "specialist-handoff-material"))).toBe(false);
    }
  });

  it("accepts and persists urgent task priority through POST /api/agent/tasks", async () => {
    const config = portableConfig("ws_task_urgent");
    const first = testHandler({ config });
    const response = await first({
      method: "POST",
      url: "/api/agent/tasks",
      body: JSON.stringify({
        taskId: "task_route_urgent",
        title: "Inspect urgent resident status",
        priority: "urgent",
        description: "Handle a time-sensitive task handoff."
      })
    });

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({ ok: true, taskId: "task_route_urgent" });
    await closeHandler(first);

    const second = testHandler({ config });
    const reloaded = await second({ method: "GET", url: "/api/agent/status" });
    expect(JSON.parse(reloaded.body).tasks).toContainEqual(expect.objectContaining({
      taskId: "task_route_urgent",
      priority: "urgent",
      description: "Handle a time-sensitive task handoff."
    }));
  });

  it("returns a stable conflict for duplicate task ids", async () => {
    const handler = testHandler({ config: portableConfig("ws_task_duplicate") });
    const body = JSON.stringify({
      taskId: "task_route_duplicate",
      title: "Inspect duplicate behavior",
      priority: "normal"
    });

    const first = await handler({ method: "POST", url: "/api/agent/tasks", body });
    const second = await handler({ method: "POST", url: "/api/agent/tasks", body });

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    expect(JSON.parse(second.body)).toEqual({
      ok: false,
      diagnostic: {
        message: "Agent task already exists.",
        allowedRepairActions: ["choose a different task id", "refresh agent status"]
      }
    });
  });

  it("returns a stable conflict when duplicate task ids race", async () => {
    const handler = testHandler({ config: portableConfig("ws_task_race") });
    const warmup = await handler({
      method: "POST",
      url: "/api/agent/tasks",
      body: JSON.stringify({
        taskId: "task_route_warmup",
        title: "Initialize resident identity",
        priority: "normal"
      })
    });
    const body = JSON.stringify({
      taskId: "task_route_concurrent_duplicate",
      title: "Inspect concurrent duplicate behavior",
      priority: "normal"
    });

    const responses = await Promise.all([
      handler({ method: "POST", url: "/api/agent/tasks", body }),
      handler({ method: "POST", url: "/api/agent/tasks", body })
    ]);
    const statuses = responses.map((response) => response.status).sort((left, right) => left - right);
    const conflict = responses.find((response) => response.status === 409);

    expect(warmup.status).toBe(200);
    expect(statuses).toEqual([200, 409]);
    expect(conflict).toBeDefined();
    expect(JSON.parse(conflict?.body ?? "{}")).toEqual({
      ok: false,
      diagnostic: {
        message: "Agent task already exists.",
        allowedRepairActions: ["choose a different task id", "refresh agent status"]
      }
    });
  });

  it("returns a stable conflict when duplicate task ids race on an empty ledger", async () => {
    const handler = testHandler({ config: portableConfig("ws_task_empty_race") });
    const body = JSON.stringify({
      taskId: "task_route_empty_concurrent_duplicate",
      title: "Inspect empty ledger duplicate behavior",
      priority: "normal"
    });

    const responses = await Promise.all([
      handler({ method: "POST", url: "/api/agent/tasks", body }),
      handler({ method: "POST", url: "/api/agent/tasks", body })
    ]);
    const statuses = responses.map((response) => response.status).sort((left, right) => left - right);
    const conflict = responses.find((response) => response.status === 409);

    expect(statuses).toEqual([200, 409]);
    expect(conflict).toBeDefined();
    expect(JSON.parse(conflict?.body ?? "{}")).toEqual({
      ok: false,
      diagnostic: {
        message: "Agent task already exists.",
        allowedRepairActions: ["choose a different task id", "refresh agent status"]
      }
    });
  });

  it("returns HTTP 400 for invalid task bodies without echoing secret-shaped text", async () => {
    const handler = testHandler();
    const response = await handler({
      method: "POST",
      url: "/api/agent/tasks",
      body: JSON.stringify({
        taskId: "task_route_invalid_shape",
        title: "invalid task shape sentinel",
        priority: "urgent",
        extra: "invalid extra sentinel"
      })
    });

    expect(response.status).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      ok: false,
      diagnostic: {
        message: "Agent task body is invalid.",
        allowedRepairActions: ["send taskId, title, and optional priority as a JSON object"]
      }
    });
    expect(response.body).not.toContain("invalid task shape sentinel");
    expect(response.body).not.toContain("invalid extra sentinel");
    expect(isAgentSecretSafeText(response.body)).toBe(true);
  });

  it("wakes the resident agent scheduler without accepting tool input", async () => {
    const { handler } = await seededApprovedToolHandler();
    const emptyObject = await seededApprovedToolHandler("toolreq_scheduler_route_empty_object");

    const rejected = await handler({
      method: "POST",
      url: "/api/agent/scheduler/wake",
      body: JSON.stringify({ toolRequestId: "toolreq_must_not_be_routed" })
    });
    const accepted = await handler({
      method: "POST",
      url: "/api/agent/scheduler/wake"
    });
    const acceptedEmptyObject = await emptyObject.handler({
      method: "POST",
      url: "/api/agent/scheduler/wake",
      body: JSON.stringify({})
    });

    expect(rejected.status).toBe(400);
    expect(accepted.status).toBe(200);
    expect(acceptedEmptyObject.status).toBe(200);
    const body = JSON.parse(accepted.body) as {
      readonly schemaVersion: string;
      readonly examinedCount: number;
      readonly completedCount: number;
      readonly eventIds: readonly string[];
    };
    expect(body.schemaVersion).toBe("agent-scheduler-wake-result.v1");
    expect(body.examinedCount).toBe(1);
    expect(body.completedCount).toBe(1);
    expect(body.eventIds).toEqual(expect.arrayContaining([expect.stringMatching(/^evt_/)]));
    expect(accepted.body).not.toMatch(/prr\.request\.sent|legal-escalation|accepted graph|provider byte transfer/i);
  });

  it("does not double-execute an approved descriptor across concurrent scheduler wake posts", async () => {
    const previewBarrier = createBarrier(2);
    let executions = 0;
    const { handler, config } = await seededApprovedToolHandler(
      "toolreq_scheduler_route_concurrent_claim",
      (preview) => schedulerWakeDescriptor(preview, {
        async buildCurrentPreview() {
          await previewBarrier.arrive();
          return {
            preview,
            sourceEventIds: ["evt_source_route_review"],
            inputArtifactHashes: [schedulerWakeArtifactHash()],
            provenanceRefs: ["evt_source_route_review", schedulerWakeArtifactHash()],
            activeLocks: [],
            freshnessChecks: [{
              name: "agent-projection",
              expected: "high-watermark:1",
              actual: "high-watermark:1",
              ok: true
            }]
          };
        },
        async executeApproved() {
          executions += 1;
          await Promise.resolve();
          return {
            eventIds: ["evt_scheduler_route_domain_completed"],
            artifactHashes: [schedulerWakeArtifactHash()],
            readModelChanges: [{
              projectionName: "agent-route-test",
              change: "scheduler wake route completed approved work"
            }],
            resultSummary: "Scheduler wake route completed approved work."
          };
        }
      })
    );

    const responses = await Promise.all([
      handler({ method: "POST", url: "/api/agent/scheduler/wake" }),
      handler({ method: "POST", url: "/api/agent/scheduler/wake" })
    ]);

    expect(responses.map((response) => response.status).sort((left, right) => left - right)).toEqual([200, 200]);
    const bodies = responses.map((response) => JSON.parse(response.body) as {
      readonly completedCount: number;
      readonly failedCount: number;
      readonly items: readonly { readonly state: string; readonly eventIds: readonly string[] }[];
    });
    const items = bodies.flatMap((body) => body.items);
    const types = await eventTypes(config);
    expect(executions).toBe(1);
    expect(bodies.reduce((sum, body) => sum + body.completedCount, 0)).toBe(1);
    expect(bodies.reduce((sum, body) => sum + body.failedCount, 0)).toBe(0);
    expect(items.filter((item) => item.state === "completed")).toHaveLength(1);
    expect(items.filter((item) => item.state === "not-ready" || item.state === "blocked")).toHaveLength(1);
    expect(items.find((item) => item.state === "completed")?.eventIds).toHaveLength(2);
    expect(types.filter((type) => type === "agent.tool.execution.claimed")).toHaveLength(1);
    expect(types.filter((type) => type === "agent.tool.completed")).toHaveLength(1);
  });

  it("uses existing auth policy for scheduler wake routes", async () => {
    const handler = testHandler({ config: protectedPortableConfig() });

    const rejected = await handler({ method: "POST", url: "/api/agent/scheduler/wake" });
    const accepted = await handler({
      method: "POST",
      url: "/api/agent/scheduler/wake",
      headers: { authorization: "Bearer route-secret" }
    });

    expect(rejected.status).toBe(401);
    expect(accepted.status).toBe(200);
  });

  it("uses existing auth policy for protected agent routes", async () => {
    const config = protectedConfig();
    const handler = testHandler({ config });
    const sessionCookie = localRuntimeSessionCookieValue(config);
    expect(sessionCookie).toBeDefined();

    const rejected = await handler({ method: "GET", url: "/api/agent/status" });
    const rejectedCockpit = await handler({ method: "GET", url: "/api/agent/cockpit" });
    const accepted = await handler({
      method: "GET",
      url: "/api/agent/status",
      headers: {
        cookie: `${LOCAL_RUNTIME_SESSION_COOKIE_NAME}=${sessionCookie}`
      }
    });
    const acceptedCockpit = await handler({
      method: "GET",
      url: "/api/agent/cockpit",
      headers: {
        cookie: `${LOCAL_RUNTIME_SESSION_COOKIE_NAME}=${sessionCookie}`
      }
    });

    expect(rejected.status).toBe(401);
    expect(rejectedCockpit.status).toBe(401);
    expect(accepted.status).toBe(200);
    expect(acceptedCockpit.status).toBe(200);
    expect(rejected.body).not.toContain(routeSessionSentinel());
    expect(rejectedCockpit.body).not.toContain(routeSessionSentinel());
    expect(accepted.body).not.toContain(routeSessionSentinel());
    expect(acceptedCockpit.body).not.toContain(routeSessionSentinel());
    expect(isAgentSecretSafeText(rejected.body)).toBe(true);
    expect(isAgentSecretSafeText(rejectedCockpit.body)).toBe(true);
    expectAgentStatusBodyToHideRuntimeMaterial(accepted.body);
    expectAgentStatusBodyToHideRuntimeMaterial(acceptedCockpit.body);
  });

  it("applies the same auth policy to agent memory routes", async () => {
    const config = protectedConfig();
    const handler = testHandler({ config });
    const sessionCookie = localRuntimeSessionCookieValue(config);
    expect(sessionCookie).toBeDefined();

    const rejected = await handler({ method: "GET", url: "/api/agent/memory" });
    const accepted = await handler({
      method: "GET",
      url: "/api/agent/memory",
      headers: {
        cookie: `${LOCAL_RUNTIME_SESSION_COOKIE_NAME}=${sessionCookie}`
      }
    });

    expect(rejected.status).toBe(401);
    expect(accepted.status).toBe(200);
    expect(rejected.body).not.toContain(routeSessionSentinel());
    expect(accepted.body).not.toContain(routeSessionSentinel());
    expect(isAgentSecretSafeText(rejected.body)).toBe(true);
  });

  it("preserves safe runtime diagnostics for memory validation failures", async () => {
    const handler = testHandler({
      config: portableConfig("ws_memory_validation"),
      agentRuntimeFactory: memoryValidationFailureRuntimeFactory()
    });
    const response = await handler({
      method: "POST",
      url: "/api/agent/memory",
      body: JSON.stringify({
        memoryId: "mem_route_diagnostic",
        scope: "workspace",
        memoryKind: "agent-observation",
        summary: "Source text sentinel that must not echo back.",
        sourceEventIds: ["evt_route_diagnostic"],
        confidence: 0.8
      })
    });

    expect(response.status).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      ok: false,
      diagnostic: {
        message: "Memory could not be recorded safely.",
        allowedRepairActions: ["review memory provenance and safe summary"]
      }
    });
    expect(response.body).not.toContain("Source text sentinel that must not echo back.");
    expect(response.body).not.toContain("evt_route_diagnostic");
    expect(isAgentSecretSafeText(response.body)).toBe(true);
  });
});

function testHandler(input: {
  readonly config?: ReturnType<typeof resolveLocalRuntimeConfig>;
  readonly env?: Record<string, string | undefined>;
  readonly now?: () => string;
  readonly agentRuntimeFactory?: LocalAgentRuntimeFactory;
  readonly residentIdentityBootstrapForTest?: CreateLocalRuntimeHttpHandlerInput["residentIdentityBootstrapForTest"];
  readonly mountedTaskAdmissionPrecommitForTest?: () => void;
  readonly residentBackgroundExecutionForTest?:
    CreateLocalRuntimeHttpHandlerInput["residentBackgroundExecutionForTest"];
  readonly mountedTaskBeforeCompletionMemoryForTest?: () => void | Promise<void>;
  readonly mountedTaskBeforeLocalEffectForTest?: () => void | Promise<void>;
  readonly mountedTaskBeforeRunStartSnapshotForTest?: () => void | Promise<void>;
  readonly mountedTaskBeforeTaskRunningForTest?: () => void | Promise<void>;
  readonly mountedTaskAfterBackgroundExecutionForTest?:
    CreateLocalRuntimeHttpHandlerInput["mountedTaskAfterBackgroundExecutionForTest"];
  readonly mountedTaskBackgroundScanForTest?: (taskCount: number) => void;
} = {}) {
  const config = input.config ?? resolveLocalRuntimeConfig({ cwd: tempDir(), env: input.env ?? {} });
  const executionTracker = createMountedTaskBackgroundExecutionTracker();
  const handler = createLocalRuntimeHttpHandler({
    config,
    actor: { id: "actor_agent_route", kind: "human", label: "Agent Route Test" },
    now: input.now ?? (() => "2026-07-07T20:00:00.000Z"),
    ...(input.agentRuntimeFactory === undefined ? {} : { agentRuntimeFactory: input.agentRuntimeFactory }),
    ...(input.residentIdentityBootstrapForTest === undefined
      ? {}
      : { residentIdentityBootstrapForTest: input.residentIdentityBootstrapForTest }),
    ...(input.mountedTaskAdmissionPrecommitForTest === undefined
      ? {}
      : { mountedTaskAdmissionPrecommitForTest: input.mountedTaskAdmissionPrecommitForTest }),
    ...(input.residentBackgroundExecutionForTest === undefined
      ? {}
      : { residentBackgroundExecutionForTest: input.residentBackgroundExecutionForTest }),
    ...(input.mountedTaskBeforeCompletionMemoryForTest === undefined
      ? {}
      : { mountedTaskBeforeCompletionMemoryForTest: input.mountedTaskBeforeCompletionMemoryForTest }),
    ...(input.mountedTaskBeforeLocalEffectForTest === undefined
      ? {}
      : { mountedTaskBeforeLocalEffectForTest: input.mountedTaskBeforeLocalEffectForTest }),
    ...(input.mountedTaskBeforeRunStartSnapshotForTest === undefined
      ? {}
      : { mountedTaskBeforeRunStartSnapshotForTest: input.mountedTaskBeforeRunStartSnapshotForTest }),
    ...(input.mountedTaskBeforeTaskRunningForTest === undefined
      ? {}
      : { mountedTaskBeforeTaskRunningForTest: input.mountedTaskBeforeTaskRunningForTest }),
    mountedTaskAfterBackgroundExecutionForTest(observation) {
      executionTracker.observe(observation);
      input.mountedTaskAfterBackgroundExecutionForTest?.(observation);
    },
    ...(input.mountedTaskBackgroundScanForTest === undefined
      ? {}
      : { mountedTaskBackgroundScanForTest: input.mountedTaskBackgroundScanForTest })
  });
  mountedTaskBackgroundExecutionTrackers.set(handler, executionTracker);
  handlers.push(handler);
  return handler;
}

function tempDir(): string {
  const cwd = mkdtempSync(join(tmpdir(), "cestus-agent-route-"));
  tempDirs.push(cwd);
  return cwd;
}

function portableConfig(workspaceId: string): ReturnType<typeof resolveLocalRuntimeConfig> {
  const cwd = tempDir();
  return persistentPortableConfig(cwd, workspaceId);
}

function persistentPortableConfig(
  cwd: string,
  workspaceId: string
): ReturnType<typeof resolveLocalRuntimeConfig> {
  const workspaceRoot = join(cwd, workspaceId);
  createPortableWorkspace({
    rootDir: workspaceRoot,
    workspaceId,
    label: `Workspace ${workspaceId}`,
    createdAt: "2026-07-10T12:00:00.000Z",
    createdBy: "agent-route-test"
  });
  return resolveLocalRuntimeConfig({
    cwd,
    env: {
      CESTUS_LOCAL_STORAGE: "portable-workspace",
      CESTUS_WORKSPACE_ROOT: workspaceRoot
    }
  });
}

function clonedCompletedMountedTaskConfig(): ReturnType<typeof resolveLocalRuntimeConfig> {
  const fixture = completedMountedTaskFixture;
  if (fixture === undefined) throw new Error("Completed mounted task fixture is unavailable.");
  const cwd = tempDir();
  const workspaceRoot = join(cwd, completedFixtureWorkspaceId);
  cpSync(fixture.workspaceRoot, workspaceRoot, { recursive: true });
  return resolveLocalRuntimeConfig({
    cwd,
    env: {
      CESTUS_LOCAL_STORAGE: "portable-workspace",
      CESTUS_WORKSPACE_ROOT: workspaceRoot
    }
  });
}

async function closeHandler(handler: LocalRuntimeHttpHandler): Promise<void> {
  await handler.close();
  const index = handlers.indexOf(handler);
  if (index >= 0) {
    handlers.splice(index, 1);
  }
}

async function eventTypes(config: ReturnType<typeof resolveLocalRuntimeConfig>): Promise<readonly string[]> {
  return (await allEvents(config)).map((event) => event.type);
}

async function allEvents(config: ReturnType<typeof resolveLocalRuntimeConfig>) {
  const ledger = new SQLiteEventLedger(config.storage.sqlitePath);
  try {
    return await ledger.readAll();
  } finally {
    ledger.close();
  }
}

async function waitForAgentEvents(
  config: ReturnType<typeof resolveLocalRuntimeConfig>,
  predicate: (events: readonly Awaited<ReturnType<typeof allEvents>>[number][]) => boolean,
  timeoutMs = 750
) {
  const deadline = Date.now() + timeoutMs;
  let events = await allEvents(config);
  while (!predicate(events) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    events = await allEvents(config);
  }
  return events;
}

async function waitForMountedTaskResult(
  handler: LocalRuntimeHttpHandler,
  url: string
) {
  const current = await handler({ method: "GET", url });
  if (current.status === 200) return current;
  const match = /^\/api\/agent\/tasks\/([^/]+)\/evidence-triage\/([^/?]+)$/.exec(url);
  if (match === null) return current;
  await waitForMountedBackgroundExecution(
    handler,
    decodeURIComponent(match[1]!),
    decodeURIComponent(match[2]!)
  );
  return await handler({ method: "GET", url });
}

async function waitForMountedBackgroundExecution(
  handler: LocalRuntimeHttpHandler,
  taskId: string,
  runId: string
): Promise<MountedTaskBackgroundExecutionObservation> {
  const tracker = mountedTaskBackgroundExecutionTrackers.get(handler);
  if (tracker === undefined) throw new Error("Mounted background execution tracker is unavailable.");
  return await tracker.waitFor(taskId, runId);
}

function createMountedTaskBackgroundExecutionTracker(): MountedTaskBackgroundExecutionTracker {
  const observations = new Map<string, MountedTaskBackgroundExecutionObservation>();
  const waiters = new Map<
    string,
    Array<(observation: MountedTaskBackgroundExecutionObservation) => void>
  >();
  const key = (taskId: string, runId: string) => `${taskId}\u0000${runId}`;
  return Object.freeze({
    observe(observation: MountedTaskBackgroundExecutionObservation) {
      const observationKey = key(observation.taskId, observation.runId);
      observations.set(observationKey, observation);
      for (const resolve of waiters.get(observationKey) ?? []) resolve(observation);
      waiters.delete(observationKey);
    },
    async waitFor(taskId: string, runId: string) {
      const observationKey = key(taskId, runId);
      const observed = observations.get(observationKey);
      if (observed !== undefined) return observed;
      return await new Promise<MountedTaskBackgroundExecutionObservation>((resolve) => {
        const pending = waiters.get(observationKey) ?? [];
        pending.push(resolve);
        waiters.set(observationKey, pending);
      });
    }
  });
}

async function createMountedEvidenceTriageTask(
  handler: LocalRuntimeHttpHandler,
  taskId: string
): Promise<void> {
  const response = await handler({
    method: "POST",
    url: "/api/agent/tasks",
    body: JSON.stringify({
      taskId,
      title: "Triage mounted evidence",
      priority: "normal",
      description: "Produce a bounded mounted evidence-triage handoff."
    })
  });
  expect(response.status, response.body).toBe(200);
}

function requireMountedWorkspace(
  config: ReturnType<typeof resolveLocalRuntimeConfig>
): MountedPortableWorkspace {
  if (config.storage.strategy !== "portable-workspace") {
    throw new Error("Mounted route fixture requires portable workspace storage.");
  }
  const mounted = mountPortableWorkspace({
    rootDir: config.storage.workspaceRoot,
    ...(config.storage.expectedWorkspaceId === undefined ? {} : {
      expectedWorkspaceId: config.storage.expectedWorkspaceId
    })
  });
  if (!mounted.ok) throw new Error("Mounted route fixture workspace is unavailable.");
  return mounted.workspace;
}

function rewriteWorkspaceManifest(
  manifestPath: string,
  patch: Readonly<Record<string, string>>
): void {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
  writeFileSync(manifestPath, `${JSON.stringify({ ...manifest, ...patch }, null, 2)}\n`);
}

function supervisionArtifactWriteState(workspace: MountedPortableWorkspace): readonly boolean[] {
  return [
    join(workspace.paths.blobRoot, "agent-prompt-artifacts"),
    join(workspace.paths.derivativeRoot, "resident-agent-mounted-task"),
    join(workspace.paths.derivativeRoot, "specialist-handoff-material"),
    join(workspace.paths.derivativeRoot, "specialist-handoff-manifest")
  ].map((path) => existsSync(path));
}

function terminalPrefixEvents(
  events: Awaited<ReturnType<typeof allEvents>>,
  taskId: string,
  runId: string
) {
  return events.filter((event) =>
    Reflect.get(event.payload, "taskId") === taskId ||
    Reflect.get(event.payload, "runId") === runId ||
    Reflect.get(event.payload, "memoryId") === `mem_${runId}_handoff`
  );
}

async function seedRetryableTaskFailure(
  config: ReturnType<typeof resolveLocalRuntimeConfig>,
  taskId: string
): Promise<void> {
  const ledger = new SQLiteEventLedger(config.storage.sqlitePath);
  try {
    const before = await ledger.readAll();
    const queued = before.findLast((event): event is KnowledgeEventOf<"agent.task.status.changed"> =>
      event.type === "agent.task.status.changed" && event.payload.taskId === taskId
    );
    if (queued === undefined) throw new Error("Retry fixture requires a queued task.");
    const attemptId = buildTaskAttemptId({ taskId, runType: "evidence-triage", retryGeneration: 0 });
    const failed = await ledger.append({
      type: "agent.task.orchestration.failed",
      version: 1,
      streamId: `agent_task_orchestration_${taskId}_evidence-triage`,
      context: {
        actor: { id: "actor_retry_fixture", kind: "system", label: "Retry fixture" },
        occurredAt: "2026-07-07T20:00:01.000Z",
        causationId: queued.id,
        correlationId: `corr_retry_fixture_${taskId}`,
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0", agent: "0.1.0" }
      },
      payload: {
        taskId,
        runType: "evidence-triage",
        attemptId,
        retryGeneration: 0,
        failedAt: "2026-07-07T20:00:01.000Z",
        category: "model-output-invalid",
        message: "The bounded specialist output failed validation.",
        retryable: true,
        allowedActions: ["retry from the durable failure"],
        relatedEventIds: [queued.id]
      }
    } satisfies AppendableKnowledgeEvent<"agent.task.orchestration.failed">, {
      expectedGlobalEventCount: before.length,
      expectedNextSequence: 1
    });
    const taskEvents = await ledger.readStream(`agent_task_${taskId}`);
    await ledger.append({
      type: "agent.task.status.changed",
      version: 1,
      streamId: `agent_task_${taskId}`,
      context: {
        actor: { id: "actor_retry_fixture", kind: "system", label: "Retry fixture" },
        occurredAt: "2026-07-07T20:00:01.000Z",
        causationId: failed.id,
        correlationId: `corr_retry_fixture_${taskId}`,
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0", agent: "0.1.0" }
      },
      payload: {
        taskId,
        status: "failed",
        changedBy: "actor_retry_fixture",
        reason: "Retryable bounded specialist failure."
      }
    } satisfies AppendableKnowledgeEvent<"agent.task.status.changed">, {
      expectedGlobalEventCount: before.length + 1,
      expectedNextSequence: taskEvents.length + 1
    });
  } finally {
    ledger.close();
  }
}

async function seedActiveMountedTaskLock(
  config: ReturnType<typeof resolveLocalRuntimeConfig>
): Promise<void> {
  const ledger = new SQLiteEventLedger(config.storage.sqlitePath);
  try {
    const task = (await ledger.readAll()).find((event) => event.type === "agent.task.created");
    if (task === undefined) throw new Error("Mounted lock fixture requires a task event.");
    await ledger.append({
      type: "agent.lock.activated",
      version: 1,
      streamId: "agent_lock_lock_mounted_task_fixture",
      context: {
        actor: { id: "actor_mounted_task_guard", kind: "system", label: "Mounted Task Guard" },
        occurredAt: "2026-07-07T19:59:00.000Z",
        causationId: task.id,
        correlationId: "corr_mounted_task_lock_fixture",
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0", agent: "0.1.0" }
      },
      payload: {
        lockId: "lock_mounted_task_fixture",
        residentAgentId: "agent_default",
        kind: "governance",
        activatedBy: "actor_mounted_task_guard",
        reason: "Mounted task fixture is locked for review.",
        relatedEventIds: [task.id]
      }
    } satisfies AppendableKnowledgeEvent<"agent.lock.activated">);
  } finally {
    ledger.close();
  }
}

async function removeMountedEvidenceSourceBytes(
  config: ReturnType<typeof resolveLocalRuntimeConfig>
): Promise<void> {
  const workspace = requireMountedWorkspace(config);
  const evidence = (await allEvents(config)).find((event) =>
    event.type === "evidence.ingested" && event.payload.evidenceId === "ev_route_mounted_triage"
  );
  if (evidence?.type !== "evidence.ingested") {
    throw new Error("Mounted source-byte removal fixture requires an evidence event.");
  }
  const digest = evidence.payload.contentHash.replace("sha256:", "");
  rmSync(join(workspace.paths.blobRoot, "sha256", digest.slice(0, 2), digest));
}

async function seedMountedEvidenceTriageSource(
  config: ReturnType<typeof resolveLocalRuntimeConfig>
): Promise<readonly string[]> {
  if (config.storage.strategy !== "portable-workspace") {
    throw new Error("Mounted evidence triage fixture requires portable workspace storage.");
  }
  const mounted = mountPortableWorkspace({
    rootDir: config.storage.workspaceRoot,
    ...(config.storage.expectedWorkspaceId === undefined ? {} : {
      expectedWorkspaceId: config.storage.expectedWorkspaceId
    })
  });
  if (!mounted.ok) throw new Error("Mounted evidence triage fixture workspace is unavailable.");
  const source = await new FileBlobStore(mounted.workspace.paths.blobRoot).put(
    Buffer.from("bounded mounted evidence triage fixture", "utf8")
  );
  const ledger = new SQLiteEventLedger(config.storage.sqlitePath);
  try {
    const evidence = await ledger.append({
      type: "evidence.ingested",
      version: 1,
      streamId: "evidence_ev_route_mounted_triage",
      context: {
        actor: { id: "actor_route_ingestion", kind: "system", label: "Route ingestion" },
        occurredAt: "2026-07-07T19:55:00.000Z",
        correlationId: "corr_route_mounted_triage",
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0", ingestion: "0.1.0" }
      },
      payload: {
        evidenceId: "ev_route_mounted_triage",
        source: { kind: "file", label: "mounted-triage-fixture.pdf" },
        contentHash: source.contentHash,
        mediaType: "application/pdf",
        sizeBytes: source.sizeBytes
      }
    } satisfies AppendableKnowledgeEvent<"evidence.ingested">);
    const linked = await ledger.append({
      type: "ingestion.evidence.linked",
      version: 1,
      streamId: "ingestion_evidence_link_src_route_mounted_triage_imp_route_mounted_triage",
      context: {
        actor: { id: "actor_route_ingestion", kind: "system", label: "Route ingestion" },
        occurredAt: "2026-07-07T19:55:01.000Z",
        causationId: evidence.id,
        correlationId: "corr_route_mounted_triage",
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0", ingestion: "0.1.0" }
      },
      payload: {
        evidenceId: "ev_route_mounted_triage",
        sourceCollectionId: "src_route_mounted_triage",
        importBatchId: "imp_route_mounted_triage",
        contentHash: source.contentHash,
        occurrenceIds: ["occ_route_mounted_triage"]
      }
    } satisfies AppendableKnowledgeEvent<"ingestion.evidence.linked">);
    return Object.freeze([evidence.id, linked.id]);
  } finally {
    ledger.close();
  }
}

async function seedAdditionalMountedEvidenceTriageSource(
  config: ReturnType<typeof resolveLocalRuntimeConfig>
): Promise<readonly string[]> {
  const mounted = requireMountedWorkspace(config);
  const source = await new FileBlobStore(mounted.paths.blobRoot).put(
    Buffer.from("second bounded mounted evidence triage fixture", "utf8")
  );
  const ledger = new SQLiteEventLedger(config.storage.sqlitePath);
  try {
    const evidence = await ledger.append({
      type: "evidence.ingested",
      version: 1,
      streamId: "evidence_ev_route_mounted_triage_second",
      context: {
        actor: { id: "actor_route_ingestion", kind: "system", label: "Route ingestion" },
        occurredAt: "2026-07-07T19:56:00.000Z",
        correlationId: "corr_route_mounted_triage_second",
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0", ingestion: "0.1.0" }
      },
      payload: {
        evidenceId: "ev_route_mounted_triage_second",
        source: { kind: "file", label: "mounted-triage-fixture-second.pdf" },
        contentHash: source.contentHash,
        mediaType: "application/pdf",
        sizeBytes: source.sizeBytes
      }
    } satisfies AppendableKnowledgeEvent<"evidence.ingested">);
    const linked = await ledger.append({
      type: "ingestion.evidence.linked",
      version: 1,
      streamId: "ingestion_evidence_link_src_route_mounted_triage_second_imp_route_mounted_triage_second",
      context: {
        actor: { id: "actor_route_ingestion", kind: "system", label: "Route ingestion" },
        occurredAt: "2026-07-07T19:56:01.000Z",
        causationId: evidence.id,
        correlationId: "corr_route_mounted_triage_second",
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0", ingestion: "0.1.0" }
      },
      payload: {
        evidenceId: "ev_route_mounted_triage_second",
        sourceCollectionId: "src_route_mounted_triage_second",
        importBatchId: "imp_route_mounted_triage_second",
        contentHash: source.contentHash,
        occurrenceIds: ["occ_route_mounted_triage_second"]
      }
    } satisfies AppendableKnowledgeEvent<"ingestion.evidence.linked">);
    return Object.freeze([evidence.id, linked.id]);
  } finally {
    ledger.close();
  }
}

async function seedInstalledPolicyAndIdentityLabel(
  config: ReturnType<typeof resolveLocalRuntimeConfig>
): Promise<void> {
  const ledger = new SQLiteEventLedger(config.storage.sqlitePath);
  try {
    const initialized = (await ledger.readAll()).find((event): event is KnowledgeEventOf<"agent.identity.initialized"> =>
      event.type === "agent.identity.initialized" && event.payload.residentAgentId === "agent_default"
    );
    if (initialized === undefined) throw new Error("Mounted policy fixture requires initialized identity.");
    const installed = await ledger.append({
      type: "agent.policy.installed",
      version: 1,
      streamId: "agent_policy_agent_policy_default",
      context: {
        actor: { id: "actor_policy_v77_reviewer", kind: "human", label: "Policy reviewer" },
        occurredAt: "2026-07-07T19:59:00.000Z",
        causationId: initialized.id,
        correlationId: "corr_mounted_policy_v77",
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0", agent: "0.1.0" }
      },
      payload: {
        policyId: "agent_policy_default",
        residentAgentId: "agent_default",
        version: "installed-policy-v77",
        installedBy: "actor_policy_v77_reviewer",
        humanGatedActionClasses: ["external-byte-transfer"],
        allowedRunTypes: ["evidence-triage"],
        credentialKinds: ["local-no-secret"],
        rationale: "Approve the bounded mounted evidence-triage run."
      }
    } satisfies AppendableKnowledgeEvent<"agent.policy.installed">);
    await ledger.append({
      type: "agent.identity.updated",
      version: 1,
      streamId: "agent_identity_agent_default",
      context: {
        actor: { id: "actor_identity_label_reviewer", kind: "human", label: "Identity reviewer" },
        occurredAt: "2026-07-07T19:59:30.000Z",
        causationId: installed.id,
        correlationId: "corr_mounted_identity_label_only",
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0", agent: "0.1.0" }
      },
      payload: {
        residentAgentId: "agent_default",
        updatedBy: "actor_identity_label_reviewer",
        rationale: "Update only the resident label after policy installation.",
        label: "Cestus Agent, reviewed label",
        previousEventId: initialized.id
      }
    } satisfies AppendableKnowledgeEvent<"agent.identity.updated">, { expectedNextSequence: 2 });
  } finally {
    ledger.close();
  }
}

async function seedMountedAcceptedAssertion(
  config: ReturnType<typeof resolveLocalRuntimeConfig>
): Promise<{ readonly assertionId: string; readonly acceptedEventId: string }> {
  const ledger = new SQLiteEventLedger(config.storage.sqlitePath);
  try {
    const service = new AssertionService({ ledger });
    const assertionId = "as_route_mounted_accepted_graph";
    await service.propose({
      assertionId,
      evidenceId: "ev_route_mounted_triage",
      subjectRef: "ent_route_mounted_accepted_graph",
      predicate: "document.review-state",
      object: "human-reviewed",
      confidence: 0.95,
      actor: { id: "actor_route_extractor", kind: "extractor", label: "Route extractor" }
    });
    const accepted = await service.accept({
      assertionId,
      acceptedBy: "actor_route_graph_reviewer",
      rationale: "The mounted evidence supports this bounded assertion.",
      actor: { id: "actor_route_graph_reviewer", kind: "human", label: "Graph reviewer" }
    });
    return Object.freeze({ assertionId, acceptedEventId: accepted.id });
  } finally {
    ledger.close();
  }
}

async function seedMountedGovernanceRestriction(
  config: ReturnType<typeof resolveLocalRuntimeConfig>
): Promise<{ readonly quarantineId: string; readonly quarantineEventId: string }> {
  const ledger = new SQLiteEventLedger(config.storage.sqlitePath);
  try {
    const reviewer = {
      id: "actor_route_governance_reviewer",
      kind: "human" as const,
      label: "Governance reviewer"
    };
    const service = new GovernanceService({ ledger, actor: reviewer });
    const quarantineId = "quarantine_route_mounted_triage_review";
    const quarantine = await service.quarantineEvidence({
      evidenceId: "ev_route_mounted_triage",
      quarantineId,
      quarantinedBy: reviewer.id,
      reason: "Restrict mounted evidence pending governance review.",
      lockLevel: "export"
    });
    return Object.freeze({ quarantineId, quarantineEventId: quarantine.id });
  } finally {
    ledger.close();
  }
}

function readMountedPromptArtifact(
  config: ReturnType<typeof resolveLocalRuntimeConfig>,
  promptArtifactHash: `sha256:${string}`
): string {
  const digest = promptArtifactHash.slice("sha256:".length);
  return readFileSync(join(
    requireMountedWorkspace(config).paths.blobRoot,
    "agent-prompt-artifacts",
    "sha256",
    digest.slice(0, 2),
    `${digest}.json`
  ), "utf8");
}

async function seededApprovedToolHandler(
  toolRequestId = "toolreq_scheduler_route",
  descriptorFactory: (preview: AgentToolPreview) => AgentApprovedToolExecutorDescriptor = schedulerWakeDescriptor
) {
  const config = portableConfig("ws_scheduler_route");
  const preview = schedulerWakePreview(toolRequestId);
  const previewHash = hashAgentToolPreview(preview);
  const ledger = new SQLiteEventLedger(config.storage.sqlitePath);
  try {
    const gateway = createAgentToolGateway({
      ledger,
      actor: { id: "actor_cestus_agent", kind: "agent", label: "Cestus Agent" },
      now: () => "2026-07-07T20:00:00.000Z"
    });
    await gateway.requestTool({
      toolRequestId,
      residentAgentId: "agent_default",
      taskId: "task_scheduler_route",
      runId: "run_scheduler_route",
      toolId: "agent.test.route-wake",
      toolVersion: "1.0.0",
      sideEffectClass: "ledger-review",
      requiredApprovalClass: "ledger-review",
      preview
    });
    await gateway.approveTool({
      toolRequestId,
      actor: { id: "actor_case_owner", kind: "human", label: "Case Owner" },
      approvedPreviewHash: previewHash,
      rationale: "Approved exact scheduler route preview."
    });
  } finally {
    ledger.close();
  }

  return {
    config,
    handler: testHandler({
      config,
      residentIdentityBootstrapForTest: async ({ workspaceId }) => readyResidentIdentityLifecycle(workspaceId),
      agentRuntimeFactory: (input) => defaultLocalAgentRuntimeFactory({
        ...input,
        approvedToolExecutors: [descriptorFactory(preview)]
      })
    }),
    previewHash
  };
}

function readyResidentIdentityLifecycle(workspaceId: string) {
  return {
    schemaVersion: "resident-identity-lifecycle.v1" as const,
    state: "ready" as const,
    residentAgentId: "agent_default" as const,
    workspaceId,
    initialized: true,
    eventIds: [],
    safeMessage: "Resident identity is ready.",
    allowedRepairActions: []
  };
}

function protectedPortableConfig(): ReturnType<typeof resolveLocalRuntimeConfig> {
  const config = portableConfig("ws_protected_scheduler");
  return {
    ...config,
    http: {
      ...config.http,
      host: "0.0.0.0",
      bindMode: "lan",
      authRequired: true,
      authToken: "route-secret"
    }
  };
}

function schedulerWakePreview(toolRequestId: string): AgentToolPreview {
  return {
    summary: `Review approved scheduler route request ${toolRequestId}.`,
    relatedEventIds: ["evt_source_route_review"],
    artifactHashes: [schedulerWakeArtifactHash()]
  };
}

function schedulerWakeDescriptor(
  preview: AgentToolPreview,
  overrides: Partial<AgentApprovedToolExecutorDescriptor> = {}
): AgentApprovedToolExecutorDescriptor {
  return {
    toolId: "agent.test.route-wake",
    toolVersion: "1.0.0",
    sideEffectClass: "ledger-review",
    approvalClass: "ledger-review",
    async buildCurrentPreview() {
      return {
        preview,
        sourceEventIds: ["evt_source_route_review"],
        inputArtifactHashes: [schedulerWakeArtifactHash()],
        provenanceRefs: ["evt_source_route_review", schedulerWakeArtifactHash()],
        activeLocks: [],
        freshnessChecks: [{
          name: "agent-projection",
          expected: "high-watermark:1",
          actual: "high-watermark:1",
          ok: true
        }]
      };
    },
    async executeApproved() {
      return {
        eventIds: ["evt_scheduler_route_domain_completed"],
        artifactHashes: [schedulerWakeArtifactHash()],
        readModelChanges: [{
          projectionName: "agent-route-test",
          change: "scheduler wake route completed approved work"
        }],
        resultSummary: "Scheduler wake route completed approved work."
      };
    },
    ...overrides
  };
}

function schedulerWakeArtifactHash(): `sha256:${string}` {
  return "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";
}

function protectedConfig(): ReturnType<typeof resolveLocalRuntimeConfig> {
  const cwd = tempDir();
  return {
    cwd,
    storage: {
      strategy: "repo-local",
      sqlitePath: join(cwd, ".cestus", "local", "prr-ledger.sqlite")
    },
    http: {
      host: "0.0.0.0",
      port: 8787,
      bindMode: "lan",
      authRequired: true,
      authToken: routeSessionSentinel(),
      devSeedEnabled: false
    },
    staticUi: { distDir: join(cwd, "dist") },
    logs: { dir: join(cwd, ".cestus", "local", "logs") }
  };
}

function nousStatusRuntimeFactory(): LocalAgentRuntimeFactory {
  return (() => ({
    status: async () => ({
      schemaVersion: "agent-status.v1",
      generatedAt: "2026-07-07T20:00:00.000Z",
      identity: undefined,
      tasks: [],
      runs: [],
      toolRequests: [],
      permissions: [],
      locks: [],
      memories: [],
      modelInvocations: [],
      providerReadiness: undefined,
      providers: [
        {
          providerId: "provider_fake_local",
          label: "Fake Local Model Provider",
          adapterVersion: "fake-provider.v1",
          endpointKind: "local-engine",
          modelFamilies: ["fake-local"],
          credentialKinds: ["local-no-secret"],
          supportsStructuredOutput: false,
          supportsToolCalling: false,
          safeDataNotes: "Deterministic local fake provider."
        },
        {
          providerId: "provider_nous_portal",
          label: "Nous Portal",
          adapterVersion: "openai-compatible-chat.v1",
          endpointKind: "openai-compatible-api",
          modelFamilies: ["tencent/hy3:free"],
          credentialKinds: [],
          supportsStructuredOutput: false,
          supportsToolCalling: false,
          safeDataNotes: "Remote model provider used only with approved prompt artifacts."
        }
      ],
      pendingApprovalCount: 0,
      activeLockCount: 0,
      diagnostics: []
    }),
    initializeDefaultIdentity: async () => ({ ok: true, residentAgentId: "agent_default", alreadyInitialized: false, eventIds: [] }),
    createTask: async () => ({ ok: true, taskId: "task_route", eventIds: [] }),
    startRun: async () => ({ ok: true, runId: "run_route", eventIds: [] }),
    invokeModel: async () => ({ ok: false, error: { severity: "error", category: "provider", message: "unused" } }),
    scheduler: {
      wake: async () => ({
        schemaVersion: "agent-scheduler-wake-result.v1",
        generatedAt: "2026-07-07T20:00:00.000Z",
        examinedCount: 0,
        resumedCount: 0,
        completedCount: 0,
        blockedCount: 0,
        failedCount: 0,
        eventIds: [],
        allowedNextActions: [],
        items: []
      })
    },
    gateway: {}
  })) as unknown as LocalAgentRuntimeFactory;
}

function memoryValidationFailureRuntimeFactory(): LocalAgentRuntimeFactory {
  return (() => ({
    status: async () => ({
      schemaVersion: "agent-status.v1",
      generatedAt: "2026-07-07T20:00:00.000Z",
      identity: undefined,
      tasks: [],
      runs: [],
      toolRequests: [],
      permissions: [],
      locks: [],
      memories: [],
      modelInvocations: [],
      providerReadiness: undefined,
      providers: [],
      pendingApprovalCount: 0,
      activeLockCount: 0,
      diagnostics: []
    }),
    listMemory: async () => ({ schemaVersion: "agent-memory-list.v1", generatedAt: "2026-07-07T20:00:00.000Z", truthBoundary: { authoritativeForOntology: false, scope: "working-memory" }, filters: { scope: "all", state: "active" }, items: [] }),
    memoryDetail: async () => undefined,
    initializeDefaultIdentity: async () => ({
      ok: true,
      residentAgentId: "agent_default",
      alreadyInitialized: false,
      eventIds: []
    }),
    recordMemory: async () => ({
      ok: false,
      error: {
        severity: "error",
        category: "agent",
        message: "Memory could not be recorded safely.",
        allowedRepairActions: ["review memory provenance and safe summary"]
      }
    }),
    supersedeMemory: async () => ({
      ok: false,
      error: {
        severity: "error",
        category: "agent",
        message: "Memory could not be superseded safely.",
        allowedRepairActions: ["refresh memory and review provenance"]
      }
    }),
    retractMemory: async () => ({
      ok: false,
      error: {
        severity: "error",
        category: "agent",
        message: "Memory could not be retracted safely.",
        allowedRepairActions: ["refresh memory and review rationale"]
      }
    }),
    createTask: async () => ({ ok: true, taskId: "task_route", eventIds: [] }),
    startRun: async () => ({ ok: true, runId: "run_route", eventIds: [] }),
    invokeModel: async () => ({ ok: false, error: { severity: "error", category: "provider", message: "unused" } }),
    gateway: {}
  })) as unknown as LocalAgentRuntimeFactory;
}

function providerSetupSentinel(): string {
  return "provider-setup-sentinel";
}

function routeSessionSentinel(): string {
  return "route-session-sentinel";
}

function expectAgentStatusBodyToHideRuntimeMaterial(body: string): void {
  expect(body).not.toContain(providerSetupSentinel());
  expect(body).not.toContain(routeSessionSentinel());
  expect(body).not.toMatch(/runtime-provider-material|authorization:\s*bearer|provider error|response body|private key|password=|secret=/i);
}

async function promiseSettlementWithin(
  promise: Promise<unknown>,
  milliseconds: number
): Promise<"settled" | "pending"> {
  return await new Promise((resolve) => {
    let observed = false;
    const finish = (state: "settled" | "pending") => {
      if (observed) return;
      observed = true;
      clearTimeout(timer);
      resolve(state);
    };
    const timer = setTimeout(() => finish("pending"), milliseconds);
    void promise.then(
      () => finish("settled"),
      () => finish("settled")
    );
  });
}

function createBarrier(count: number): { readonly arrive: () => Promise<void> } {
  let arrivals = 0;
  let release: (() => void) | undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });

  return {
    async arrive() {
      arrivals += 1;
      if (arrivals >= count) {
        release?.();
      }
      await released;
    }
  };
}
