import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
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
  defaultLocalAgentRuntimeFactory,
  type LocalAgentRuntimeFactory
} from "../src/agent-runtime-factory.js";
import {
  createLocalRuntimeHttpHandler,
  type CreateLocalRuntimeHttpHandlerInput,
  type LocalRuntimeHttpHandler
} from "../src/http-handler.js";

const handlers: LocalRuntimeHttpHandler[] = [];
const tempDirs: string[] = [];

afterEach(() => {
  for (const handler of handlers.splice(0)) {
    handler.close();
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
    closeHandler(handler);
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
    closeHandler(handler);
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
    closeHandler(handler);
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
    first.close();
    handlers.splice(handlers.indexOf(first), 1);

    const second = testHandler({ config });
    const reloaded = await second({ method: "GET", url: "/api/agent/status" });
    expect(JSON.parse(reloaded.body).tasks).toContainEqual(expect.objectContaining({
      taskId: "task_route_001",
      description: "Check readiness before handing work to the resident agent."
    }));
  });

  it("completes and reconstructs a mounted local evidence-triage task through production routes", async () => {
    const config = portableConfig("ws_mounted_evidence_triage");
    const sourceEventIds = await seedMountedEvidenceTriageSource(config);
    const first = testHandler({ config });
    const created = await first({
      method: "POST",
      url: "/api/agent/tasks",
      body: JSON.stringify({
        taskId: "task_route_mounted_triage",
        title: "Triage mounted evidence",
        priority: "normal",
        description: "Produce a bounded local evidence-triage handoff."
      })
    });

    expect(created.status).toBe(200);
    const executed = await first({
      method: "POST",
      url: "/api/agent/tasks/task_route_mounted_triage/evidence-triage",
      body: JSON.stringify({
        runId: "run_route_mounted_triage",
        evidenceIds: ["ev_route_mounted_triage"],
        providerMode: "local-fake"
      })
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

    closeHandler(first);
    const second = testHandler({ config });
    const reconstructed = await second({
      method: "GET",
      url: "/api/agent/tasks/task_route_mounted_triage/evidence-triage/run_route_mounted_triage"
    });
    const status = await second({ method: "GET", url: "/api/agent/status" });

    expect(reconstructed.status).toBe(200);
    expect(JSON.parse(reconstructed.body)).toEqual(completed);
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

    closeHandler(second);
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

    closeHandler(first);
    const second = testHandler({ config });
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
    const config = portableConfig("ws_mounted_advancing_clock");
    await seedMountedEvidenceTriageSource(config);
    let tick = 0;
    const now = () => new Date(
      Date.parse("2026-07-07T20:00:00.000Z") + tick++ * 1_000
    ).toISOString();
    const handler = testHandler({ config, now });
    await createMountedEvidenceTriageTask(handler, "task_route_mounted_advancing_clock");

    const response = await handler({
      method: "POST",
      url: "/api/agent/tasks/task_route_mounted_advancing_clock/evidence-triage",
      body: JSON.stringify({
        runId: "run_route_mounted_advancing_clock",
        evidenceIds: ["ev_route_mounted_triage"],
        providerMode: "local-fake"
      })
    });

    expect(response.status, response.body).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({ state: "completed" });
  });

  it("fails before downstream effects when the installed resident policy excludes evidence triage", async () => {
    const config = portableConfig("ws_mounted_policy_excludes_triage");
    await seedMountedEvidenceTriageSource(config);
    const first = testHandler({ config });
    await createMountedEvidenceTriageTask(first, "task_route_mounted_policy_excludes_triage");
    closeHandler(first);

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
    const config = portableConfig("ws_mounted_reordered_replay");
    await seedMountedEvidenceTriageSource(config);
    await seedAdditionalMountedEvidenceTriageSource(config);
    const handler = testHandler({ config });
    const taskId = "task_route_mounted_reordered_replay";
    const runId = "run_route_mounted_reordered_replay";
    await createMountedEvidenceTriageTask(handler, taskId);

    const initial = await handler({
      method: "POST",
      url: `/api/agent/tasks/${taskId}/evidence-triage`,
      body: JSON.stringify({
        runId,
        evidenceIds: ["ev_route_mounted_triage", "ev_route_mounted_triage_second"],
        providerMode: "local-fake"
      })
    });
    expect(initial.status, initial.body).toBe(200);
    const idsBefore = (await allEvents(config)).map((event) => event.id);

    const reordered = await handler({
      method: "POST",
      url: `/api/agent/tasks/${taskId}/evidence-triage`,
      body: JSON.stringify({
        runId,
        evidenceIds: ["ev_route_mounted_triage_second", "ev_route_mounted_triage"],
        providerMode: "local-fake"
      })
    });

    expect(reordered.status, reordered.body).toBe(409);
    expect((await allEvents(config)).map((event) => event.id)).toEqual(idsBefore);
  });

  it("keeps the effective installed policy version after a label-only identity update", async () => {
    const config = portableConfig("ws_mounted_installed_policy_identity_label");
    await seedMountedEvidenceTriageSource(config);
    const first = testHandler({ config });
    const taskId = "task_route_mounted_installed_policy_identity_label";
    const runId = "run_route_mounted_installed_policy_identity_label";
    await createMountedEvidenceTriageTask(first, taskId);
    closeHandler(first);

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

    const fresh = testHandler({ config });
    const response = await fresh({
      method: "POST",
      url: `/api/agent/tasks/${taskId}/evidence-triage`,
      body: JSON.stringify({
        runId,
        evidenceIds: ["ev_route_mounted_triage"],
        providerMode: "local-fake"
      })
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
    const config = portableConfig("ws_mounted_terminal_replay");
    await seedMountedEvidenceTriageSource(config);
    const handler = testHandler({ config });
    const taskId = "task_route_mounted_terminal_replay";
    await createMountedEvidenceTriageTask(handler, taskId);
    const completed = await handler({
      method: "POST",
      url: `/api/agent/tasks/${taskId}/evidence-triage`,
      body: JSON.stringify({
        runId: "run_route_mounted_terminal_replay_local",
        evidenceIds: ["ev_route_mounted_triage"],
        providerMode: "local-fake"
      })
    });
    expect(completed.status, completed.body).toBe(200);
    const idsBefore = (await allEvents(config)).map((event) => event.id);

    const replay = await handler({
      method: "POST",
      url: `/api/agent/tasks/${taskId}/evidence-triage`,
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
      taskId,
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
    const config = portableConfig("ws_mounted_canonical_manifest_store");
    await seedMountedEvidenceTriageSource(config);
    const handler = testHandler({ config });
    await createMountedEvidenceTriageTask(handler, "task_route_mounted_canonical_manifest_store");
    const response = await handler({
      method: "POST",
      url: "/api/agent/tasks/task_route_mounted_canonical_manifest_store/evidence-triage",
      body: JSON.stringify({
        runId: "run_route_mounted_canonical_manifest_store",
        evidenceIds: ["ev_route_mounted_triage"],
        providerMode: "local-fake"
      })
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
    closeHandler(first);
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
    first.close();
    handlers.splice(handlers.indexOf(first), 1);

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
} = {}) {
  const config = input.config ?? resolveLocalRuntimeConfig({ cwd: tempDir(), env: input.env ?? {} });
  const handler = createLocalRuntimeHttpHandler({
    config,
    actor: { id: "actor_agent_route", kind: "human", label: "Agent Route Test" },
    now: input.now ?? (() => "2026-07-07T20:00:00.000Z"),
    ...(input.agentRuntimeFactory === undefined ? {} : { agentRuntimeFactory: input.agentRuntimeFactory }),
    ...(input.residentIdentityBootstrapForTest === undefined
      ? {}
      : { residentIdentityBootstrapForTest: input.residentIdentityBootstrapForTest })
  });
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

function closeHandler(handler: LocalRuntimeHttpHandler): void {
  handler.close();
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
): Promise<void> {
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
    await ledger.append({
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
