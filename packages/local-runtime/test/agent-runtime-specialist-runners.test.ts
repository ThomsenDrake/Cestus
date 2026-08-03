import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createContextPackRegistry,
  serializeContextPackPayload
} from "../../agent/src/context-packs.js";
import { buildAgentCockpit } from "../../agent/src/cockpit.js";
import {
  buildSelectionManifestHash,
  investigativeRegistrationIdentity,
  registerInvestigativeContextPacks,
  type InvestigativeContextPackDependencies,
  type InvestigativeEvidenceRow,
  type InvestigativeSelectionManifestBody
} from "../../agent/src/investigative-context-packs.js";
import {
  registerOperationalContextPackBuilders,
  type OperationalContextPackProvider
} from "../../agent/src/operational-context-packs.js";
import {
  productionSpecialistPromptRegistrationFor,
  renderProductionSpecialistPrompt
} from "../../agent/src/production-specialist-prompts.js";
import {
  buildSpecialistHandoffMaterial,
  hashSpecialistHandoffMaterial
} from "../../agent/src/specialist-handoff-manifest.js";
import {
  hashUntrustedSpecialistHandoffPreparation,
  type UntrustedSpecialistHandoffPreparationV1
} from "../../agent/src/specialist-handoff-preparation.js";
import { buildSpecialistHandoffProjection } from "../../agent/src/specialist-handoff-projection.js";
import { createAgentRuntime } from "../../agent/src/runtime.js";
import { buildTaskAttemptId, taskOrchestrationStreamId } from "../../agent/src/task-orchestrator-events.js";
import type {
  ActiveClaimReconciliationPort,
  DurableSupervisorLeasePort,
  SupervisorLeaseReadbackEvidence,
  WorkspaceAdmissionSnapshot
} from "../../agent/src/wake-supervisor.js";
import { FileBlobStore } from "../../ontology/src/blob-store.js";
import type { AppendableKnowledgeEvent, KnowledgeEvent } from "../../ontology/src/contracts.js";
import type { EventLedger } from "../../ontology/src/event-ledger.js";
import { createPortableWorkspace } from "../../workspace/src/index.js";
import {
  consumeMountedSourcedInvestigationDispatch,
  createSourcedInvestigationSpecialistRunner,
  createUntrustedSpecialistRunner,
  type UntrustedSpecialistRunner
} from "../src/agent-runtime-specialist-runners.js";
import * as specialistRunnerSurface from "../src/agent-runtime-specialist-runners.js";
import { handleAgentHttpRoute } from "../src/agent-http-routes.js";
import {
  bindMountedSourcedInvestigationHandoffForLocalAgentRuntimeFactory
} from "../src/agent-runtime-factory.js";
import { createMountedSourcedInvestigationExecutionPort } from "../src/agent-runtime-mounted-task.js";
import { resolveLocalRuntimeConfig } from "../src/config.js";
import {
  issueMountedArtifactAuthorityOperationForFactory,
  registerMountedArtifactAuthorityIssuerForWakeRuntime
} from "../src/mounted-artifact-authority-operation.js";
import {
  createPortableMountedAgentArtifactStoreProducer,
  preflightPortableMountedAgentHandoffBinding,
  type FactoryPortableMountedAgentHandoffProducerResultV1
} from "../src/portable-mounted-agent-artifact-stores.js";
import {
  createPortableWorkspaceLifecyclePorts,
  type PortableWorkspaceLifecyclePorts
} from "../src/portable-workspace-lifecycle.js";
import { createSqlitePrrRuntime, type LocalRuntimeHandle } from "../src/runtime-factory.js";
import {
  createResidentSupervisionRuntime,
  type ResidentSupervisionRuntime
} from "../src/wake-supervisor-runtime.js";

const dispatch = Object.freeze({
  taskId: "task_runtime",
  runType: "evidence-triage" as const,
  attemptId: "attempt_runtime",
  approvedRunId: "run_runtime"
});
const mountedTempDirs: string[] = [];
const mountedHandles: LocalRuntimeHandle[] = [];
const mountedSupervisions: ResidentSupervisionRuntime[] = [];

afterEach(async () => {
  for (const supervision of mountedSupervisions.splice(0)) await supervision.stop();
  for (const handle of mountedHandles.splice(0)) handle.close();
  for (const dir of mountedTempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  vi.useRealTimers();
});

describe("untrusted specialist runner", () => {
  it("reaches both sourced run types through the production mounted resident HTTP caller", async () => {
    const fixture = await mountedSourcedResidentFactoryFixture();
    type SourcedRequest = {
      readonly taskId: string;
      readonly runId: string;
      readonly runType: "timeline-builder" | "contradiction-finder";
      readonly evidenceIds: readonly string[];
    };
    type SourcedSuccess = {
      readonly recorded: { readonly manifest: {
        readonly schemaVersion: string;
        readonly outputArtifacts: readonly { readonly artifactHash: `sha256:${string}` }[];
      } };
      readonly replay: { readonly state: string; readonly diagnostics: readonly unknown[] };
      readonly cockpit: { readonly selectedRun?: {
        readonly runId: string;
        readonly runType: string;
        readonly state: string;
        readonly handoff?: { readonly outputArtifacts: readonly { readonly artifactKind: string }[] };
      } };
    };
    const request = async (input: SourcedRequest) => await handleAgentHttpRoute({
        request: {
          method: "POST",
          url: `/api/agent/tasks/${input.taskId}/sourced-investigation`,
          body: JSON.stringify({
            runId: input.runId,
            runType: input.runType,
            evidenceIds: input.evidenceIds
          })
        },
        handle: fixture.handle,
        actor: { id: "actor_sourced_factory_http", kind: "system", label: "Sourced Factory HTTP" },
        now: fixture.now,
        supervision: fixture.supervision
      });
    const success = (response: NonNullable<Awaited<ReturnType<typeof request>>>): SourcedSuccess => {
      expect(response?.status).toBe(200);
      return JSON.parse(response.body) as SourcedSuccess;
    };

    const timelineResponse = await request({
      taskId: fixture.timelineTaskId,
      runId: fixture.timelineRunId,
      runType: "timeline-builder",
      evidenceIds: [fixture.evidenceId]
    });
    if (timelineResponse === undefined) throw new Error("sourced timeline route was not reached");
    const timeline = success(timelineResponse);
    expect(timeline).toMatchObject({
      recorded: { manifest: { schemaVersion: "agent-specialist-handoff-manifest.v2" } },
      replay: { state: "task-completed", diagnostics: [] },
      cockpit: { selectedRun: {
        runId: fixture.timelineRunId,
        runType: "timeline-builder",
        state: "completed",
        handoff: { outputArtifacts: [{ artifactKind: "timeline-artifact" }] }
      } }
    });
    const timelineArtifact = await readMountedSourcedOutputArtifact(
      fixture.handle,
      timeline.recorded.manifest.outputArtifacts[0]!.artifactHash
    );
    expect(timelineArtifact).toMatchObject({
      schemaVersion: "sourced-timeline-artifact.v1",
      items: [],
      omittedSources: [{
        sourceRef: fixture.evidenceId,
        reason: expect.stringMatching(/structured canonical source date/i)
      }],
      unresolvedPrompts: [expect.stringMatching(/source date|date range/i)]
    });

    const contradictionRequest = Object.freeze({
      taskId: fixture.contradictionTaskId,
      runId: fixture.contradictionRunId,
      runType: "contradiction-finder" as const,
      evidenceIds: [fixture.evidenceId]
    });
    const eventsBeforeLiveLeaseRetry = await fixture.handle.ledger.readAll();
    const artifactsBeforeLiveLeaseRetry = mountedSourcedArtifactSnapshot(fixture.handle);
    const liveLeaseResponse = await request(contradictionRequest);
    expect(liveLeaseResponse?.status).toBe(409);
    expect(liveLeaseResponse === undefined ? undefined : JSON.parse(liveLeaseResponse.body)).toMatchObject({
      ok: false,
      diagnostic: {
        message: "The current resident wake lease has already issued its one-shot investigation authority.",
        allowedRepairActions: [
          "retry after the current resident wake lease expires",
          "inspect resident supervision status without invoking a provider"
        ]
      }
    });
    expect(await fixture.handle.ledger.readAll()).toEqual(eventsBeforeLiveLeaseRetry);
    expect(mountedSourcedArtifactSnapshot(fixture.handle)).toEqual(artifactsBeforeLiveLeaseRetry);

    fixture.advancePastLeaseExpiry();
    const contradictionResponse = await request(contradictionRequest);
    if (contradictionResponse === undefined) throw new Error("sourced contradiction route was not reached");
    const contradiction = success(contradictionResponse);
    expect(contradiction).toMatchObject({
      recorded: { manifest: { schemaVersion: "agent-specialist-handoff-manifest.v2" } },
      replay: { state: "task-completed", diagnostics: [] },
      cockpit: { selectedRun: {
        runId: fixture.contradictionRunId,
        runType: "contradiction-finder",
        state: "completed",
        handoff: { outputArtifacts: [{ artifactKind: "contradiction-candidate-dossier" }] }
      } }
    });
    const contradictionArtifact = await readMountedSourcedOutputArtifact(
      fixture.handle,
      contradiction.recorded.manifest.outputArtifacts[0]!.artifactHash
    );
    expect(contradictionArtifact).toMatchObject({
      schemaVersion: "contradiction-candidate-dossier.v1",
      candidates: []
    });
    const events = await fixture.handle.ledger.readAll();
    expect(events.filter((event) => event.type === "agent.task.orchestration.completed")).toHaveLength(2);
    expect(events.filter((event) => event.type === "agent.specialist-handoff.recorded")).toHaveLength(2);
    expect(events.filter((event) => event.type === "agent.wake.supervisor.lease.claimed.v1")).toHaveLength(2);
    expect(events.filter((event) => event.type === "agent.model-invocation.requested" ||
      event.type === "agent.model-invocation.completed")).toHaveLength(0);
    expect(JSON.stringify([timeline.cockpit, contradiction.cockpit]))
      .not.toMatch(/mounted resident sourced evidence bytes|authorization:|provider body/i);
  });

  it("grounds production timeline items only in exact assertion and PRR ledger history", async () => {
    const fixture = await mountedSourcedResidentFactoryFixture({ canonicalDatedFacts: true });
    if (fixture.canonicalDatedFacts === undefined) throw new Error("canonical dated facts are unavailable");
    const response = await handleAgentHttpRoute({
      request: {
        method: "POST",
        url: `/api/agent/tasks/${fixture.timelineTaskId}/sourced-investigation`,
        body: JSON.stringify({
          runId: fixture.timelineRunId,
          runType: "timeline-builder",
          evidenceIds: [fixture.evidenceId]
        })
      },
      handle: fixture.handle,
      actor: { id: "actor_sourced_grounded_http", kind: "system", label: "Sourced Grounded HTTP" },
      now: fixture.now,
      supervision: fixture.supervision
    });
    expect(response?.status).toBe(200);
    const result = JSON.parse(response!.body) as {
      readonly recorded: { readonly manifest: {
        readonly outputArtifacts: readonly { readonly artifactHash: `sha256:${string}` }[];
      } };
    };
    const artifact = await readMountedSourcedOutputArtifact(
      fixture.handle,
      result.recorded.manifest.outputArtifacts[0]!.artifactHash
    );
    expect(artifact).toMatchObject({
      schemaVersion: "sourced-timeline-artifact.v1",
      items: expect.arrayContaining([expect.objectContaining({
        itemId: `timeline_assertion_${fixture.canonicalDatedFacts.assertionId}`,
        date: "2026-04-03",
        precision: "day",
        summary: `Ledger history includes human review event ${fixture.canonicalDatedFacts.assertionAcceptedEventId} for assertion ${fixture.canonicalDatedFacts.assertionId}.`,
        evidence: expect.arrayContaining([expect.objectContaining({ evidenceId: fixture.evidenceId })]),
        assertions: expect.arrayContaining([expect.objectContaining({
          assertionId: fixture.canonicalDatedFacts.assertionId,
          acceptedByEventId: fixture.canonicalDatedFacts.assertionAcceptedEventId
        })]),
        prrEvents: []
      }), expect.objectContaining({
        itemId: `timeline_prr_${fixture.canonicalDatedFacts.prrProductionEventId}`,
        date: "2026-04-05",
        precision: "day",
        summary: `PRR event ${fixture.canonicalDatedFacts.prrProductionEventId} (prr.production.received) occurred.`,
        evidence: expect.arrayContaining([expect.objectContaining({ evidenceId: fixture.evidenceId })]),
        assertions: [],
        prrEvents: expect.arrayContaining([expect.objectContaining({
          eventId: fixture.canonicalDatedFacts.prrProductionEventId
        })])
      })]),
      omittedSources: [],
      unresolvedPrompts: []
    });
    expect(JSON.stringify(artifact)).not.toContain("mounted resident sourced evidence bytes");
    const events = await fixture.handle.ledger.readAll();
    expect(events.filter((event) => event.type === "agent.model-invocation.requested" ||
      event.type === "agent.model-invocation.completed")).toHaveLength(0);
  });

  it("binds each timeline summary item only to its own exact ledger provenance", async () => {
    const fixture = await mountedSourcedResidentFactoryFixture({
      canonicalDatedFacts: true,
      secondEvidence: "accepted-assertion"
    });
    if (fixture.canonicalDatedFacts === undefined || fixture.secondEvidenceId === undefined ||
      fixture.secondEvidenceFacts?.assertionId === undefined ||
      fixture.secondEvidenceFacts.assertionProposedEventId === undefined ||
      fixture.secondEvidenceFacts.assertionAcceptedEventId === undefined) {
      throw new Error("two exact assertion histories are unavailable");
    }
    const selectedEvidenceIds = [fixture.evidenceId, fixture.secondEvidenceId];
    const timeline = await runMountedSourcedResidentRequest(fixture, {
      taskId: fixture.timelineTaskId,
      runId: fixture.timelineRunId,
      runType: "timeline-builder",
      evidenceIds: selectedEvidenceIds
    });
    expect(timeline.status, timeline.body).toBe(200);

    fixture.advancePastLeaseExpiry();
    const contradiction = await runMountedSourcedResidentRequest(fixture, {
      taskId: fixture.contradictionTaskId,
      runId: fixture.contradictionRunId,
      runType: "contradiction-finder",
      evidenceIds: selectedEvidenceIds
    });
    expect(contradiction.status, contradiction.body).toBe(200);
    const timelineContext = await readTimelineContextFromSourcedResponse(fixture.handle, contradiction.body);
    const items = timelineContext.items as readonly {
      readonly itemId: string;
      readonly sourceEventIds: readonly string[];
    }[];
    const first = items.find((item) =>
      item.itemId === `timeline_assertion_${fixture.canonicalDatedFacts!.assertionId}`
    );
    const second = items.find((item) =>
      item.itemId === `timeline_assertion_${fixture.secondEvidenceFacts!.assertionId}`
    );
    expect(first?.sourceEventIds).toEqual([
      fixture.canonicalDatedFacts.evidenceIngestedEventId,
      fixture.canonicalDatedFacts.assertionProposedEventId,
      fixture.canonicalDatedFacts.assertionAcceptedEventId
    ].sort());
    expect(second?.sourceEventIds).toEqual([
      fixture.secondEvidenceFacts.evidenceIngestedEventId,
      fixture.secondEvidenceFacts.assertionProposedEventId,
      fixture.secondEvidenceFacts.assertionAcceptedEventId
    ].sort());
    expect(first === undefined || second === undefined
      ? undefined
      : first.sourceEventIds.filter((eventId) => second.sourceEventIds.includes(eventId))).toEqual([]);
  });

  it("selects the replayable timeline relevant to current evidence when a newer unrelated timeline exists", async () => {
    const fixture = await mountedSourcedResidentFactoryFixture({
      canonicalDatedFacts: true,
      secondEvidence: "undated"
    });
    if (fixture.canonicalDatedFacts === undefined || fixture.secondEvidenceId === undefined ||
      fixture.unrelatedTimelineTaskId === undefined || fixture.unrelatedTimelineRunId === undefined) {
      throw new Error("relevant and unrelated timeline histories are unavailable");
    }
    const relevant = await runMountedSourcedResidentRequest(fixture, {
      taskId: fixture.timelineTaskId,
      runId: fixture.timelineRunId,
      runType: "timeline-builder",
      evidenceIds: [fixture.evidenceId]
    });
    expect(relevant.status, relevant.body).toBe(200);

    fixture.advancePastLeaseExpiry();
    const unrelated = await runMountedSourcedResidentRequest(fixture, {
      taskId: fixture.unrelatedTimelineTaskId,
      runId: fixture.unrelatedTimelineRunId,
      runType: "timeline-builder",
      evidenceIds: [fixture.secondEvidenceId]
    });
    expect(unrelated.status, unrelated.body).toBe(200);

    fixture.advancePastLeaseExpiry();
    const contradiction = await runMountedSourcedResidentRequest(fixture, {
      taskId: fixture.contradictionTaskId,
      runId: fixture.contradictionRunId,
      runType: "contradiction-finder",
      evidenceIds: [fixture.evidenceId]
    });
    expect(contradiction.status, contradiction.body).toBe(200);
    const timelineContext = await readTimelineContextFromSourcedResponse(fixture.handle, contradiction.body);
    expect(timelineContext.items).toEqual(expect.arrayContaining([expect.objectContaining({
      itemId: `timeline_assertion_${fixture.canonicalDatedFacts.assertionId}`
    })]));
  });

  it("fails closed when two replayable timelines are relevant to the selected evidence", async () => {
    const fixture = await mountedSourcedResidentFactoryFixture({
      canonicalDatedFacts: true,
      secondEvidence: "accepted-assertion"
    });
    if (fixture.secondEvidenceId === undefined || fixture.unrelatedTimelineTaskId === undefined ||
      fixture.unrelatedTimelineRunId === undefined) {
      throw new Error("ambiguous timeline histories are unavailable");
    }
    const selectedEvidenceIds = [fixture.evidenceId, fixture.secondEvidenceId];
    const aggregate = await runMountedSourcedResidentRequest(fixture, {
      taskId: fixture.timelineTaskId,
      runId: fixture.timelineRunId,
      runType: "timeline-builder",
      evidenceIds: selectedEvidenceIds
    });
    expect(aggregate.status, aggregate.body).toBe(200);

    fixture.advancePastLeaseExpiry();
    const overlapping = await runMountedSourcedResidentRequest(fixture, {
      taskId: fixture.unrelatedTimelineTaskId,
      runId: fixture.unrelatedTimelineRunId,
      runType: "timeline-builder",
      evidenceIds: [fixture.secondEvidenceId]
    });
    expect(overlapping.status, overlapping.body).toBe(200);

    fixture.advancePastLeaseExpiry();
    const contradiction = await runMountedSourcedResidentRequest(fixture, {
      taskId: fixture.contradictionTaskId,
      runId: fixture.contradictionRunId,
      runType: "contradiction-finder",
      evidenceIds: selectedEvidenceIds
    });
    expect(contradiction.status).toBe(409);
    expect(JSON.parse(contradiction.body)).toMatchObject({
      diagnostic: { message: expect.stringMatching(/ambiguous replayable timelines/i) }
    });
  });

  it("keeps successful HTTP cancellation quiescent across an active sourced execution", async () => {
    const promptBoundaryEntered = Promise.withResolvers<void>();
    const releasePromptBoundary = Promise.withResolvers<void>();
    const fixture = await mountedSourcedResidentFactoryFixture({
      beforePromptArtifactWriteForTest: async () => {
        promptBoundaryEntered.resolve();
        await releasePromptBoundary.promise;
      }
    });
    const controller = createSqlitePrrRuntime({
      config: resolveLocalRuntimeConfig({
        cwd: fixture.workspaceRoot,
        env: {
          CESTUS_LOCAL_STORAGE: "portable-workspace",
          CESTUS_WORKSPACE_ROOT: fixture.workspaceRoot
        }
      }),
      actor: { id: "actor_sourced_cancel", kind: "human", label: "Sourced Cancellation Reviewer" },
      now: fixture.now
    });
    mountedHandles.push(controller);
    const execution = runMountedSourcedResidentRequest(fixture, {
      taskId: fixture.timelineTaskId,
      runId: fixture.timelineRunId,
      runType: "timeline-builder",
      evidenceIds: [fixture.evidenceId]
    });
    await promptBoundaryEntered.promise;
    const controllerRuntime = createAgentRuntime({
      ledger: controller.ledger,
      actor: { id: "agent_default", kind: "agent", label: "Cestus Agent" },
      now: fixture.now,
      providers: []
    });
    const statusAtBoundary = await controllerRuntime.status();
    const artifactsAtFence = mountedSourcedArtifactSnapshot(fixture.handle);
    let cancelSettled = false;
    const cancellation = handleAgentHttpRoute({
      request: {
        method: "POST",
        url: `/api/agent/tasks/${fixture.timelineTaskId}/cancel`
      },
      handle: controller,
      actor: { id: "actor_sourced_cancel", kind: "human", label: "Sourced Cancellation Reviewer" },
      now: fixture.now,
      supervision: fixture.supervision,
      agentRuntimeFactory: () => controllerRuntime
    }).then((response) => {
      cancelSettled = true;
      return response;
    });
    try {
      expect(statusAtBoundary.tasks)
        .toContainEqual(expect.objectContaining({ taskId: fixture.timelineTaskId, status: "running" }));
      await Promise.race([
        waitForMountedLedgerEvent(controller, (event) =>
          event.type === "agent.task.status.changed" &&
          event.payload.taskId === fixture.timelineTaskId && event.payload.status === "canceled"
        ),
        cancellation.then((response) => {
          throw new Error(`cancellation settled before its durable fence with status ${response?.status}`);
        })
      ]);
      await Promise.resolve();
      expect(cancelSettled).toBe(false);
    } finally {
      releasePromptBoundary.resolve();
    }

    const [canceled, sourced] = await Promise.all([cancellation, execution]);
    expect(canceled?.status, canceled?.body).toBe(200);
    expect(canceled === undefined ? undefined : JSON.parse(canceled.body)).toMatchObject({
      task: { taskId: fixture.timelineTaskId, status: "canceled" }
    });
    expect(sourced.status).toBe(409);
    const events = await fixture.handle.ledger.readAll();
    const canceledIndex = events.findIndex((event) => event.type === "agent.task.status.changed" &&
      event.payload.taskId === fixture.timelineTaskId && event.payload.status === "canceled");
    expect(canceledIndex).toBeGreaterThanOrEqual(0);
    expect(events.slice(canceledIndex + 1).some((event) =>
      (event.type.startsWith("agent.specialist-handoff.") && Reflect.get(event.payload, "runId") === fixture.timelineRunId) ||
      (event.type === "agent.specialist-run.completed" && event.payload.runId === fixture.timelineRunId) ||
      (event.type === "agent.task.orchestration.completed" && event.payload.runId === fixture.timelineRunId) ||
      (event.type === "agent.task.status.changed" && event.payload.taskId === fixture.timelineTaskId &&
        event.payload.status !== "canceled")
    )).toBe(false);
    expect(mountedSourcedArtifactSnapshot(fixture.handle)).toEqual(artifactsAtFence);
  });

  it("forgets a sourced wake identity whose startup is blocked before a later retry", async () => {
    const fixture = await mountedSourcedResidentFactoryFixture();
    await fixture.supervision.snapshot();
    const contender = createResidentSupervisionRuntime({
      runtimeHandle: fixture.handle,
      actor: { id: "agent_default", kind: "agent", label: "Cestus Agent" },
      now: fixture.now,
      createSupervisorOwnerId: () => "owner_sourced_blocked_retry",
      issueMountedSourcedInvestigationHandoff: async (wakeRuntime, task) =>
        await bindMountedSourcedInvestigationHandoffForLocalAgentRuntimeFactory({
          wakeRuntime,
          taskId: task.taskId,
          runId: task.runId,
          runType: task.runType
        }),
      sourcedInvestigationExecution: createMountedSourcedInvestigationExecutionPort({
        handle: fixture.handle,
        now: fixture.now
      })
    });
    mountedSupervisions.push(contender);
    const task = Object.freeze({
      taskId: fixture.timelineTaskId,
      runId: fixture.timelineRunId,
      runType: "timeline-builder" as const,
      evidenceIds: Object.freeze([fixture.evidenceId])
    });
    await expect(contender.executeSourcedInvestigation(task)).rejects.toThrow(
      "Resident supervision lease is unavailable for sourced investigation."
    );

    fixture.advancePastLeaseExpiry();
    await expect(contender.executeSourcedInvestigation(task)).resolves.toMatchObject({
      replay: { state: "task-completed", diagnostics: [] }
    });
    expect((await fixture.handle.ledger.readAll()).filter((event) =>
      event.type === "agent.wake.supervisor.lease.claimed.v1"
    )).toHaveLength(2);
  });

  it("uses a fresh one-shot authority after the normal lease poll replaces the consumed wake", async () => {
    vi.useFakeTimers();
    const fixture = await mountedSourcedResidentFactoryFixture();
    await fixture.supervision.snapshot();
    const timeline = await handleAgentHttpRoute({
      request: {
        method: "POST",
        url: `/api/agent/tasks/${fixture.timelineTaskId}/sourced-investigation`,
        body: JSON.stringify({
          runId: fixture.timelineRunId,
          runType: "timeline-builder",
          evidenceIds: [fixture.evidenceId]
        })
      },
      handle: fixture.handle,
      actor: { id: "actor_sourced_poll_http", kind: "system", label: "Sourced Poll HTTP" },
      now: fixture.now,
      supervision: fixture.supervision
    });
    expect(timeline?.status).toBe(200);

    fixture.advancePastLeaseExpiry();
    await vi.advanceTimersByTimeAsync(300_001);
    expect((await fixture.handle.ledger.readAll()).filter((event) =>
      event.type === "agent.wake.supervisor.lease.claimed.v1"
    )).toHaveLength(2);

    const contradiction = await handleAgentHttpRoute({
      request: {
        method: "POST",
        url: `/api/agent/tasks/${fixture.contradictionTaskId}/sourced-investigation`,
        body: JSON.stringify({
          runId: fixture.contradictionRunId,
          runType: "contradiction-finder",
          evidenceIds: [fixture.evidenceId]
        })
      },
      handle: fixture.handle,
      actor: { id: "actor_sourced_poll_http", kind: "system", label: "Sourced Poll HTTP" },
      now: fixture.now,
      supervision: fixture.supervision
    });
    expect(contradiction?.status).toBe(200);
  });

  it("dispatches through mounted authority and replays the handoff into the selected-run cockpit", async () => {
    expect(Reflect.get(specialistRunnerSurface, "consumeMountedSourcedInvestigationDispatch"))
      .toBeTypeOf("function");
    const fixture = await mountedSourcedInvestigationFixture();
    const sourceBytes = Buffer.from("mounted sourced timeline evidence bytes", "utf8");
    const sourceHash = hashBytes(sourceBytes);
    const authority = await sourcedRunnerAuthority(fixture.dispatch, {
      sourceEventId: fixture.sourceEventId,
      evidenceContentHash: sourceHash,
      investigationId: fixture.investigationId,
      workspaceId: fixture.workspaceId
    });
    const storedSource = await fixture.handoff.binding.materialStore.put(sourceBytes);
    expect(storedSource.contentHash).toBe(sourceHash);
    const evidencePack = await authority.contextRegistry.buildResolved("evidence-summary.v1");
    const selectionManifest = (evidencePack.payload as unknown as {
      readonly selectionManifest: Readonly<Record<string, unknown>>;
    }).selectionManifest;
    const { manifestHash, ...selectionManifestBody } = selectionManifest;
    const selectionBytes = Buffer.from(serializeContextPackPayload(selectionManifestBody));
    const storedSelection = await fixture.handoff.binding.materialStore.put(selectionBytes);
    expect(storedSelection.contentHash).toBe(manifestHash);
    await appendMountedModelTranscript({
      ledger: fixture.handle.ledger,
      actor: fixture.actor,
      dispatch: fixture.dispatch,
      startedEventId: fixture.startedEventId,
      inputArtifactHash: authority.promptArtifact.manifest.inputArtifactHash as `sha256:${string}`
    });
    const runner = createSourcedInvestigationSpecialistRunner({
      resolve: () => ({
        ...authority,
        artifactStore: fixture.handoff.binding.materialStore,
        execution: { mode: "fake" as const, invoke: async () => sourcedTimelineOutput(sourceHash) }
      })
    });

    const consumed = await consumeMountedSourcedInvestigationDispatch({
      runner,
      dispatch: fixture.dispatch,
      retryGeneration: 0,
      handoff: fixture.handoff,
      ledger: fixture.handle.ledger,
      actor: fixture.actor,
      now: () => sourcedNow
    });

    expect(consumed.recorded.manifest.schemaVersion).toBe("agent-specialist-handoff-manifest.v2");
    expect(consumed.authorityConsumption.eventIds).toHaveLength(6);
    const mounted = fixture.handle.mountedWorkspace;
    if (mounted === undefined) throw new Error("portable fixture is not mounted");
    const replayed = await buildSpecialistHandoffProjection({
      events: await fixture.handle.ledger.readAll(),
      manifestReader: new FileBlobStore(join(mounted.paths.derivativeRoot, "specialist-handoff-manifest")),
      runId: fixture.dispatch.approvedRunId,
      taskId: fixture.dispatch.taskId
    });
    expect(replayed).toMatchObject({
      state: "task-completed",
      diagnostics: [],
      selectedHandoff: {
        runType: "timeline-builder",
        runId: fixture.dispatch.approvedRunId,
        taskId: fixture.dispatch.taskId,
        outputArtifacts: [{ artifactKind: "timeline-artifact" }]
      }
    });
    const cockpit = buildAgentCockpit({
      status: await fixture.runtime.status(),
      selectedRunId: fixture.dispatch.approvedRunId,
      specialistHandoffs: replayed.selectedHandoff === undefined ? [] : [replayed.selectedHandoff]
    });
    expect(cockpit.selectedRun).toMatchObject({
      runId: fixture.dispatch.approvedRunId,
      runType: "timeline-builder",
      state: "completed",
      handoff: {
        runType: "timeline-builder",
        status: "ready-for-review",
        outputArtifacts: [{
          artifactKind: "timeline-artifact",
          schemaId: "timeline-builder-handoff.v1"
        }]
      }
    });
    expect(JSON.stringify(cockpit.selectedRun)).not.toMatch(/mounted sourced timeline evidence bytes|authorization:|provider body/i);
  });

  it("rejects caller authority, store, registration, provenance, readiness, and H tuples before delegation", async () => {
    let delegateCalls = 0;
    let handoffCalls = 0;
    let providerCalls = 0;
    const hostileConstructor = {
      delegate: async () => {
        delegateCalls += 1;
        return preparationFor(dispatch);
      },
      authority: Object.freeze({ workspaceId: "ws_forged" }),
      artifactStores: Object.freeze({}),
      registration: Object.freeze({}),
      registrationProvenance: Object.freeze({}),
      readiness: Object.freeze({}),
      handoffCapability: Object.freeze({
        async readback() {
          handoffCalls += 1;
        }
      }),
      provider: Object.freeze({
        async invoke() {
          providerCalls += 1;
        }
      })
    };

    expect(() => createUntrustedSpecialistRunner(hostileConstructor as never))
      .toThrow(expect.objectContaining({ code: "runner-preparation-invalid" }));
    expect(delegateCalls).toBe(0);
    expect(handoffCalls).toBe(0);
    expect(providerCalls).toBe(0);

    const runner = runnerFor(async () => {
      delegateCalls += 1;
      return preparationFor(dispatch);
    });
    await expect(runner.dispatch({
      ...dispatch,
      authority: hostileConstructor.authority,
      artifactStores: hostileConstructor.artifactStores,
      registration: hostileConstructor.registration,
      registrationProvenance: hostileConstructor.registrationProvenance,
      readiness: hostileConstructor.readiness,
      handoffCapability: hostileConstructor.handoffCapability,
      provider: hostileConstructor.provider
    } as never)).rejects.toMatchObject({ code: "runner-preparation-invalid" });
    expect(delegateCalls).toBe(0);
    expect(handoffCalls).toBe(0);
    expect(providerCalls).toBe(0);
  });

  it("normalizes the public dispatch before the delegate await", async () => {
    let entered!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    let received: unknown;
    const runner = runnerFor(async (input) => {
      received = input;
      entered();
      await blocked;
      return preparationFor(input);
    });
    const mutableDispatch: {
      taskId: string;
      runType: "evidence-triage";
      attemptId: string;
      approvedRunId: string;
    } = { ...dispatch };

    const pending = runner.dispatch(mutableDispatch);
    await started;
    mutableDispatch.taskId = "task_swapped_after_await";
    release();

    await expect(pending).resolves.toMatchObject({
      preparation: {
        preparation: { taskId: "task_runtime" }
      }
    });
    expect(received).toEqual(dispatch);
    expect(Object.isFrozen(received)).toBe(true);
  });

  it("composes deterministic local timeline execution into a canonical nonterminal preparation", async () => {
    const store = sourcedStore();
    let invocations = 0;
    const runner = createSourcedInvestigationSpecialistRunner({
      resolve: async (dispatch) => ({
        ...await sourcedRunnerAuthority(dispatch),
        artifactStore: store,
        execution: {
          mode: "fake" as const,
          invoke: async () => {
            invocations += 1;
            return sourcedTimelineOutput();
          }
        }
      })
    });

    const result = await runner.dispatch({
      taskId: "task_timeline_runtime",
      runType: "timeline-builder",
      attemptId: "attempt_timeline_runtime",
      approvedRunId: "run_timeline_runtime"
    });

    expect(invocations).toBe(1);
    expect(store.putCount()).toBe(8);
    expect(result.preparation?.preparation).toMatchObject({
      taskId: "task_timeline_runtime",
      attemptId: "attempt_timeline_runtime",
      approvedRunId: "run_timeline_runtime",
      runType: "timeline-builder",
      handoffMaterial: {
        status: "ready-for-review",
        outputArtifacts: [{
          artifactKind: "timeline-artifact",
          schemaId: "timeline-builder-handoff.v1"
        }]
      }
    });
  });

  it("keeps the sourced runner fail-closed for remote provider transfer", async () => {
    const store = sourcedStore();
    let invocations = 0;
    const runner = createSourcedInvestigationSpecialistRunner({
      resolve: async (dispatch) => ({
        ...await sourcedRunnerAuthority(dispatch),
        artifactStore: store,
        execution: {
          mode: "remote" as const,
          invoke: async () => {
            invocations += 1;
            return sourcedTimelineOutput();
          }
        }
      })
    });

    await expect(runner.dispatch({
      taskId: "task_timeline_remote",
      runType: "timeline-builder",
      attemptId: "attempt_timeline_remote",
      approvedRunId: "run_timeline_remote"
    })).rejects.toThrow(/provider byte-transfer approval|remote.*blocked/i);
    expect(invocations).toBe(0);
    expect(store.putCount()).toBe(0);
  });
});

function runnerFor(delegate: (input: {
  readonly taskId: string;
  readonly runType: string;
  readonly attemptId: string;
  readonly approvedRunId: string;
}) => Promise<unknown>): UntrustedSpecialistRunner {
  return createUntrustedSpecialistRunner({ delegate });
}

function preparationFor(input: {
  readonly taskId: string;
  readonly runType: string;
  readonly attemptId: string;
  readonly approvedRunId: string;
}): UntrustedSpecialistHandoffPreparationV1 {
  const handoffMaterial = buildSpecialistHandoffMaterial({
    status: "ready-for-review",
    safeSummary: "A bounded nonterminal preparation.",
    contextPackRefs: [Object.freeze({
      contextPackId: "workspace-overview.v1",
      version: 1,
      contentHash: hash("a"),
      sizeBytes: 1,
      generatedAt: "2026-07-15T00:00:00.000Z",
      safeSummary: "Workspace overview.",
      provenanceRefs: Object.freeze(["evt_source_runtime"])
    })],
    outputArtifacts: [],
    toolRequestIds: [],
    approvalRequirements: [],
    nextSafeActions: [],
    sourceEventIds: ["evt_source_runtime"],
    relatedEventIds: ["evt_related_runtime"]
  });
  const unsigned = {
    schemaVersion: "agent-specialist-handoff-preparation.v1" as const,
    taskId: input.taskId,
    attemptId: input.attemptId,
    approvedRunId: input.approvedRunId,
    runType: input.runType,
    handoffMaterial,
    handoffMaterialHash: hashSpecialistHandoffMaterial(handoffMaterial)
  };
  return Object.freeze({
    ...unsigned,
    preparationHash: hashUntrustedSpecialistHandoffPreparation(unsigned)
  });
}

function hash(character: string): `sha256:${string}` {
  return `sha256:${character.repeat(64)}`;
}

function hashBytes(bytes: Buffer): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function mountedSourcedArtifactSnapshot(handle: LocalRuntimeHandle): readonly string[] {
  const mounted = handle.mountedWorkspace;
  if (mounted === undefined) throw new Error("mounted sourced artifact snapshot requires a workspace");
  const files: string[] = [];
  const visit = (root: string, label: string, relativePath = ""): void => {
    const directory = relativePath.length === 0 ? root : join(root, relativePath);
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const child = relativePath.length === 0 ? entry.name : join(relativePath, entry.name);
      if (entry.isDirectory()) {
        visit(root, label, child);
      } else if (entry.isFile()) {
        files.push(`${label}/${child}:${hashBytes(readFileSync(join(root, child)))}`);
      }
    }
  };
  for (const [label, root] of [
    ["blob", mounted.paths.blobRoot],
    ["derivative", mounted.paths.derivativeRoot],
    ["job", mounted.paths.jobRoot],
    ["projection", mounted.paths.projectionRoot],
    ["cache", mounted.paths.cacheRoot],
    ["config", mounted.paths.configRoot]
  ] as const) {
    visit(root, label);
  }
  return Object.freeze(files.sort());
}

async function readMountedSourcedOutputArtifact(
  handle: LocalRuntimeHandle,
  artifactHash: `sha256:${string}`
): Promise<Record<string, unknown>> {
  const mounted = handle.mountedWorkspace;
  if (mounted === undefined) throw new Error("mounted sourced output requires a workspace");
  const bytes = await new FileBlobStore(
    join(mounted.paths.derivativeRoot, "specialist-handoff-material")
  ).get(artifactHash);
  return JSON.parse(bytes.toString("utf8")) as Record<string, unknown>;
}

async function runMountedSourcedResidentRequest(
  fixture: {
    readonly handle: LocalRuntimeHandle;
    readonly supervision: ResidentSupervisionRuntime;
    readonly now: () => string;
  },
  input: {
    readonly taskId: string;
    readonly runId: string;
    readonly runType: "timeline-builder" | "contradiction-finder";
    readonly evidenceIds: readonly string[];
  }
) {
  const response = await handleAgentHttpRoute({
    request: {
      method: "POST",
      url: `/api/agent/tasks/${input.taskId}/sourced-investigation`,
      body: JSON.stringify({
        runId: input.runId,
        runType: input.runType,
        evidenceIds: input.evidenceIds
      })
    },
    handle: fixture.handle,
    actor: { id: "actor_sourced_helper", kind: "system", label: "Sourced Helper" },
    now: fixture.now,
    supervision: fixture.supervision
  });
  if (response === undefined) throw new Error("sourced resident route was not reached");
  return response;
}

async function readTimelineContextFromSourcedResponse(
  handle: LocalRuntimeHandle,
  responseBody: string
): Promise<Record<string, unknown>> {
  const response = JSON.parse(responseBody) as {
    readonly recorded: { readonly manifest: {
      readonly outputArtifacts: readonly { readonly artifactHash: `sha256:${string}` }[];
    } };
  };
  const dossier = await readMountedSourcedOutputArtifact(
    handle,
    response.recorded.manifest.outputArtifacts[0]!.artifactHash
  );
  const timelineRef = (dossier.contextPackRefs as readonly {
    readonly contextPackId: string;
    readonly contentHash: `sha256:${string}`;
  }[]).find((ref) => ref.contextPackId === "timeline-draft-summary.v1");
  if (timelineRef === undefined) throw new Error("timeline draft context ref is unavailable");
  return await readMountedSourcedOutputArtifact(handle, timelineRef.contentHash);
}

async function waitForMountedLedgerEvent(
  handle: LocalRuntimeHandle,
  predicate: (event: KnowledgeEvent) => boolean
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if ((await handle.ledger.readAll()).some(predicate)) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 1));
  }
  throw new Error("timed out waiting for mounted ledger event");
}

async function mountedSourcedResidentFactoryFixture(options: {
  readonly canonicalDatedFacts?: boolean;
  readonly secondEvidence?: "undated" | "accepted-assertion";
  readonly beforePromptArtifactWriteForTest?: (() => void | Promise<void>) | undefined;
} = {}): Promise<{
  readonly handle: LocalRuntimeHandle;
  readonly workspaceRoot: string;
  readonly supervision: ResidentSupervisionRuntime;
  readonly now: () => string;
  advancePastLeaseExpiry(): void;
  readonly evidenceId: string;
  readonly timelineTaskId: string;
  readonly timelineRunId: string;
  readonly contradictionTaskId: string;
  readonly contradictionRunId: string;
  readonly canonicalDatedFacts?: {
    readonly assertionId: string;
    readonly assertionProposedEventId: string;
    readonly assertionAcceptedEventId: string;
    readonly prrProductionEventId: string;
    readonly evidenceIngestedEventId: string;
    readonly evidenceLinkedEventId: string;
  };
  readonly secondEvidenceId?: string;
  readonly secondEvidenceFacts?: {
    readonly evidenceIngestedEventId: string;
    readonly evidenceLinkedEventId: string;
    readonly assertionId?: string | undefined;
    readonly assertionProposedEventId?: string | undefined;
    readonly assertionAcceptedEventId?: string | undefined;
  };
  readonly unrelatedTimelineTaskId?: string;
  readonly unrelatedTimelineRunId?: string;
}> {
  let authoritativeNow = sourcedNow;
  const now = () => authoritativeNow;
  const workspaceId = `ws_sourced_factory_${mountedTempDirs.length + 1}`;
  const workspaceRoot = mkdtempSync(join(tmpdir(), "cestus-sourced-factory-"));
  mountedTempDirs.push(workspaceRoot);
  createPortableWorkspace({
    rootDir: workspaceRoot,
    workspaceId,
    label: "Mounted sourced resident factory fixture",
    createdAt: sourcedNow,
    createdBy: "agent_default"
  });
  const handle = createSqlitePrrRuntime({
    config: resolveLocalRuntimeConfig({
      cwd: workspaceRoot,
      env: { CESTUS_LOCAL_STORAGE: "portable-workspace", CESTUS_WORKSPACE_ROOT: workspaceRoot }
    }),
    actor: { id: "actor_sourced_factory_test", kind: "system", label: "Sourced Factory Test" },
    now
  });
  mountedHandles.push(handle);
  const actor = Object.freeze({ id: "agent_default" as const, kind: "agent" as const, label: "Cestus Agent" as const });
  const setup = createAgentRuntime({ ledger: handle.ledger, actor, now, providers: [] });
  await setup.initializeDefaultIdentity({
    workspaceId,
    allowedRunTypes: ["timeline-builder", "contradiction-finder"]
  });
  const mounted = handle.mountedWorkspace;
  if (mounted === undefined) throw new Error("sourced resident factory fixture is not mounted");
  const source = await new FileBlobStore(mounted.paths.blobRoot).put(
    Buffer.from("mounted resident sourced evidence bytes", "utf8")
  );
  const evidenceId = "ev_sourced_factory_001";
  const ingested = await handle.ledger.append({
    type: "evidence.ingested",
    version: 1,
    streamId: `evidence_${evidenceId}`,
    context: {
      actor,
      occurredAt: sourcedNow,
      correlationId: "corr_sourced_factory_evidence",
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", ingestion: "0.1.0" }
    },
    payload: {
      evidenceId,
      source: { kind: "file", label: "sourced-factory.txt" },
      contentHash: source.contentHash,
      mediaType: "text/plain",
      sizeBytes: source.sizeBytes
    }
  } satisfies AppendableKnowledgeEvent<"evidence.ingested">);
  const linked = await handle.ledger.append({
    type: "ingestion.evidence.linked",
    version: 1,
    streamId: "ingestion_evidence_link_src_sourced_factory_imp_sourced_factory",
    context: {
      actor,
      occurredAt: sourcedNow,
      causationId: ingested.id,
      correlationId: "corr_sourced_factory_evidence",
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", ingestion: "0.1.0" }
    },
    payload: {
      evidenceId,
      sourceCollectionId: "src_sourced_factory",
      importBatchId: "imp_sourced_factory",
      contentHash: source.contentHash,
      occurrenceIds: ["occ_sourced_factory"]
    }
  } satisfies AppendableKnowledgeEvent<"ingestion.evidence.linked">);
  let canonicalDatedFacts: {
    readonly assertionId: string;
    readonly assertionProposedEventId: string;
    readonly assertionAcceptedEventId: string;
    readonly prrProductionEventId: string;
    readonly evidenceIngestedEventId: string;
    readonly evidenceLinkedEventId: string;
  } | undefined;
  const firstTaskSourceEventIds: string[] = [];
  const secondTaskSourceEventIds: string[] = [];
  if (options.canonicalDatedFacts === true) {
    const assertionId = "as_sourced_factory_001";
    const proposed = await handle.ledger.append({
      type: "assertion.proposed",
      version: 1,
      streamId: `assertion_${assertionId}`,
      context: {
        actor,
        occurredAt: "2026-04-02T09:00:00.000Z",
        causationId: ingested.id,
        correlationId: "corr_sourced_factory_assertion",
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0" }
      },
      payload: {
        assertionId,
        evidenceId,
        subjectRef: "subject_sourced_factory",
        predicate: "has-reviewed-record",
        object: true,
        confidence: 1,
        reviewState: "proposed"
      }
    } satisfies AppendableKnowledgeEvent<"assertion.proposed">);
    const reviewer = Object.freeze({
      id: "actor_sourced_factory_reviewer",
      kind: "human" as const,
      label: "Sourced Factory Reviewer"
    });
    const accepted = await handle.ledger.append({
      type: "assertion.accepted",
      version: 1,
      streamId: `assertion_${assertionId}`,
      context: {
        actor: reviewer,
        occurredAt: "2026-04-03T10:15:00.000Z",
        causationId: proposed.id,
        correlationId: "corr_sourced_factory_assertion",
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0" }
      },
      payload: {
        assertionId,
        acceptedBy: reviewer.id,
        rationale: "The exact local source was reviewed by a human."
      }
    } satisfies AppendableKnowledgeEvent<"assertion.accepted">);
    const prrRequestId = "prr_sourced_factory_001";
    const prrCreated = await handle.ledger.append({
      type: "prr.request.created",
      version: 1,
      streamId: prrRequestId,
      context: {
        actor,
        occurredAt: "2026-04-04T08:00:00.000Z",
        correlationId: "corr_sourced_factory_prr",
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0", prr: "0.1.0" }
      },
      payload: {
        prrRequestId,
        jurisdictionPack: { name: "florida-public-records", version: "0.1.0" },
        agency: { name: "Sourced Factory Records Office" },
        requester: { name: "Sourced Factory Investigator" },
        requestText: "Provide the selected source record.",
        status: "draft"
      }
    } satisfies AppendableKnowledgeEvent<"prr.request.created">);
    const prrProduction = await handle.ledger.append({
      type: "prr.production.received",
      version: 1,
      streamId: prrRequestId,
      context: {
        actor,
        occurredAt: "2026-04-05T11:30:00.000Z",
        causationId: prrCreated.id,
        correlationId: "corr_sourced_factory_prr",
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0", prr: "0.1.0" }
      },
      payload: {
        prrRequestId,
        productionId: "prod_sourced_factory_001",
        label: "Selected source production",
        receivedAt: "2026-04-05T11:30:00.000Z",
        evidenceIds: [evidenceId]
      }
    } satisfies AppendableKnowledgeEvent<"prr.production.received">);
    firstTaskSourceEventIds.push(proposed.id, accepted.id, prrCreated.id, prrProduction.id);
    canonicalDatedFacts = Object.freeze({
      assertionId,
      assertionProposedEventId: proposed.id,
      assertionAcceptedEventId: accepted.id,
      prrProductionEventId: prrProduction.id,
      evidenceIngestedEventId: ingested.id,
      evidenceLinkedEventId: linked.id
    });
  }
  let secondEvidenceId: string | undefined;
  let secondEvidenceFacts: {
    readonly evidenceIngestedEventId: string;
    readonly evidenceLinkedEventId: string;
    readonly assertionId?: string | undefined;
    readonly assertionProposedEventId?: string | undefined;
    readonly assertionAcceptedEventId?: string | undefined;
  } | undefined;
  let secondSourceHash: `sha256:${string}` | undefined;
  if (options.secondEvidence !== undefined) {
    secondEvidenceId = "ev_sourced_factory_002";
    const secondSource = await new FileBlobStore(mounted.paths.blobRoot).put(
      Buffer.from("mounted resident second sourced evidence bytes", "utf8")
    );
    secondSourceHash = secondSource.contentHash;
    const secondIngested = await handle.ledger.append({
      type: "evidence.ingested",
      version: 1,
      streamId: `evidence_${secondEvidenceId}`,
      context: {
        actor,
        occurredAt: sourcedNow,
        correlationId: "corr_sourced_factory_evidence_second",
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0", ingestion: "0.1.0" }
      },
      payload: {
        evidenceId: secondEvidenceId,
        source: { kind: "file", label: "sourced-factory-second.txt" },
        contentHash: secondSource.contentHash,
        mediaType: "text/plain",
        sizeBytes: secondSource.sizeBytes
      }
    } satisfies AppendableKnowledgeEvent<"evidence.ingested">);
    const secondLinked = await handle.ledger.append({
      type: "ingestion.evidence.linked",
      version: 1,
      streamId: "ingestion_evidence_link_src_sourced_factory_second_imp_sourced_factory_second",
      context: {
        actor,
        occurredAt: sourcedNow,
        causationId: secondIngested.id,
        correlationId: "corr_sourced_factory_evidence_second",
        coreVersion: "0.1.0",
        packVersions: { core: "0.1.0", ingestion: "0.1.0" }
      },
      payload: {
        evidenceId: secondEvidenceId,
        sourceCollectionId: "src_sourced_factory_second",
        importBatchId: "imp_sourced_factory_second",
        contentHash: secondSource.contentHash,
        occurrenceIds: ["occ_sourced_factory_second"]
      }
    } satisfies AppendableKnowledgeEvent<"ingestion.evidence.linked">);
    secondTaskSourceEventIds.push(secondIngested.id, secondLinked.id);
    if (options.secondEvidence === "accepted-assertion") {
      const assertionId = "as_sourced_factory_002";
      const proposed = await handle.ledger.append({
        type: "assertion.proposed",
        version: 1,
        streamId: `assertion_${assertionId}`,
        context: {
          actor,
          occurredAt: "2026-04-06T09:00:00.000Z",
          causationId: secondIngested.id,
          correlationId: "corr_sourced_factory_assertion_second",
          coreVersion: "0.1.0",
          packVersions: { core: "0.1.0" }
        },
        payload: {
          assertionId,
          evidenceId: secondEvidenceId,
          subjectRef: "subject_sourced_factory_second",
          predicate: "has-reviewed-record",
          object: true,
          confidence: 1,
          reviewState: "proposed"
        }
      } satisfies AppendableKnowledgeEvent<"assertion.proposed">);
      const reviewer = Object.freeze({
        id: "actor_sourced_factory_reviewer_second",
        kind: "human" as const,
        label: "Sourced Factory Reviewer Second"
      });
      const accepted = await handle.ledger.append({
        type: "assertion.accepted",
        version: 1,
        streamId: `assertion_${assertionId}`,
        context: {
          actor: reviewer,
          occurredAt: "2026-04-07T10:15:00.000Z",
          causationId: proposed.id,
          correlationId: "corr_sourced_factory_assertion_second",
          coreVersion: "0.1.0",
          packVersions: { core: "0.1.0" }
        },
        payload: {
          assertionId,
          acceptedBy: reviewer.id,
          rationale: "The second exact local source was reviewed by a human."
        }
      } satisfies AppendableKnowledgeEvent<"assertion.accepted">);
      secondTaskSourceEventIds.push(proposed.id, accepted.id);
      secondEvidenceFacts = Object.freeze({
        evidenceIngestedEventId: secondIngested.id,
        evidenceLinkedEventId: secondLinked.id,
        assertionId,
        assertionProposedEventId: proposed.id,
        assertionAcceptedEventId: accepted.id
      });
    } else {
      secondEvidenceFacts = Object.freeze({
        evidenceIngestedEventId: secondIngested.id,
        evidenceLinkedEventId: secondLinked.id
      });
    }
  }
  const timelineTaskId = "task_sourced_factory_timeline";
  const contradictionTaskId = "task_sourced_factory_contradiction";
  const unrelatedTimelineTaskId = secondEvidenceId === undefined
    ? undefined
    : "task_sourced_factory_unrelated_timeline";
  for (const [taskId, title] of [
    [timelineTaskId, "Build the mounted sourced timeline"],
    [contradictionTaskId, "Find mounted sourced contradictions"],
    ...(unrelatedTimelineTaskId === undefined
      ? []
      : [[unrelatedTimelineTaskId, "Build an unrelated mounted sourced timeline"] as const])
  ]) {
    const secondOnly = taskId === unrelatedTimelineTaskId;
    const includeSecond = secondOnly || options.secondEvidence === "accepted-assertion";
    const created = await setup.createTask({
      taskId,
      title,
      requestedBy: actor.id,
      priority: "normal",
      sourceEventIds: [
        ...(secondOnly ? [] : [ingested.id, linked.id, ...firstTaskSourceEventIds]),
        ...(includeSecond ? secondTaskSourceEventIds : [])
      ],
      inputArtifactHashes: [
        ...(secondOnly ? [] : [source.contentHash]),
        ...(includeSecond && secondSourceHash !== undefined ? [secondSourceHash] : [])
      ]
    });
    if (!created.ok) throw new Error("sourced resident factory fixture task was not created");
  }
  const supervision = createResidentSupervisionRuntime({
    runtimeHandle: handle,
    actor,
    now,
    issueMountedSourcedInvestigationHandoff: async (wakeRuntime, task) =>
      await bindMountedSourcedInvestigationHandoffForLocalAgentRuntimeFactory({
        wakeRuntime,
        taskId: task.taskId,
        runId: task.runId,
        runType: task.runType
      }),
    sourcedInvestigationExecution: createMountedSourcedInvestigationExecutionPort({
      handle,
      now,
      ...(options.beforePromptArtifactWriteForTest === undefined
        ? {}
        : { beforePromptArtifactWriteForTest: options.beforePromptArtifactWriteForTest })
    })
  });
  mountedSupervisions.push(supervision);
  return Object.freeze({
    handle,
    workspaceRoot,
    supervision,
    now,
    advancePastLeaseExpiry() {
      authoritativeNow = new Date(Date.parse(authoritativeNow) + 300_001).toISOString();
    },
    evidenceId,
    timelineTaskId,
    timelineRunId: "run_sourced_factory_timeline",
    contradictionTaskId,
    contradictionRunId: "run_sourced_factory_contradiction",
    ...(canonicalDatedFacts === undefined ? {} : { canonicalDatedFacts }),
    ...(secondEvidenceId === undefined ? {} : {
      secondEvidenceId,
      secondEvidenceFacts,
      unrelatedTimelineTaskId,
      unrelatedTimelineRunId: "run_sourced_factory_unrelated_timeline"
    })
  });
}

async function mountedSourcedInvestigationFixture(): Promise<{
  readonly workspaceId: string;
  readonly investigationId: string;
  readonly handle: LocalRuntimeHandle;
  readonly runtime: ReturnType<typeof createAgentRuntime>;
  readonly actor: { readonly id: "agent_default"; readonly kind: "agent"; readonly label: "Cestus Agent" };
  readonly dispatch: {
    readonly taskId: string;
    readonly runType: "timeline-builder";
    readonly attemptId: `attempt_${string}`;
    readonly approvedRunId: string;
  };
  readonly sourceEventId: string;
  readonly startedEventId: string;
  readonly handoff: FactoryPortableMountedAgentHandoffProducerResultV1;
}> {
  const workspaceId = `ws_sourced_mounted_${mountedTempDirs.length + 1}`;
  const investigationId = "investigation_mounted_timeline_001";
  const taskId = "task_mounted_timeline_001";
  const runId = "run_mounted_timeline_001";
  const workspaceRoot = mkdtempSync(join(tmpdir(), "cestus-sourced-mounted-"));
  mountedTempDirs.push(workspaceRoot);
  createPortableWorkspace({
    rootDir: workspaceRoot,
    workspaceId,
    label: "Mounted sourced timeline fixture",
    createdAt: sourcedNow,
    createdBy: "actor_sourced_mounted_test"
  });
  const actor = Object.freeze({ id: "agent_default" as const, kind: "agent" as const, label: "Cestus Agent" as const });
  const handle = createSqlitePrrRuntime({
    config: resolveLocalRuntimeConfig({
      cwd: workspaceRoot,
      env: { CESTUS_LOCAL_STORAGE: "portable-workspace", CESTUS_WORKSPACE_ROOT: workspaceRoot }
    }),
    actor: { id: "actor_sourced_mounted_test", kind: "system", label: "Sourced Mounted Test" },
    now: () => sourcedNow
  });
  mountedHandles.push(handle);
  const attemptId = buildTaskAttemptId({ taskId, runType: "timeline-builder", retryGeneration: 0 });
  const sourcedDispatch = Object.freeze({
    taskId,
    runType: "timeline-builder" as const,
    attemptId,
    approvedRunId: runId
  });
  const ports = mountedSourcedLifecyclePorts({
    workspaceId,
    workspaceIdentityEventId: "evt_sourced_workspace_identity",
    highWaterMark: "evt_sourced_high_water_005",
    highWaterOrdinal: 5
  });
  const wakeRuntime = {};
  registerMountedArtifactAuthorityIssuerForWakeRuntime({
    wakeRuntime,
    lifecyclePorts: ports,
    runtimeHandle: handle
  });
  await admitMountedSourcedAuthority(ports, workspaceId);
  const handoff = await createPortableMountedAgentArtifactStoreProducer(
    issueMountedArtifactAuthorityOperationForFactory(wakeRuntime)
  ).bind({
    taskId,
    attemptId,
    approvedRunId: runId,
    runType: "timeline-builder",
    retryGeneration: 0
  });
  await preflightPortableMountedAgentHandoffBinding({
    binding: handoff.binding,
    controller: handoff.controller,
    taskId,
    attemptId,
    runId,
    runType: "timeline-builder",
    retryGeneration: 0
  });

  const runtime = createAgentRuntime({ ledger: handle.ledger, actor, now: () => sourcedNow, providers: [] });
  await runtime.initializeDefaultIdentity({ workspaceId });
  await runtime.createTask({
    taskId,
    title: "Build an authority-bound sourced timeline",
    requestedBy: "actor_investigator",
    priority: "normal"
  });
  const sourceEvent = (await handle.ledger.readAll()).find((event) => event.type === "agent.task.created");
  if (sourceEvent === undefined) throw new Error("mounted source provenance event is unavailable");
  await appendMountedAttemptBinding(handle.ledger, { taskId, runId, attemptId, actor });
  const started = await runtime.startRun({
    runId,
    taskId,
    runType: "timeline-builder",
    scope: { kind: "workspace", refs: [workspaceId] }
  });
  if (!started.ok) throw new Error("mounted sourced run did not start");
  const startedEvent = (await handle.ledger.readStream(`agent_run_${runId}`)).find((event) =>
    event.type === "agent.specialist-run.started"
  );
  if (startedEvent === undefined) throw new Error("mounted sourced started event is unavailable");

  return Object.freeze({
    workspaceId,
    investigationId,
    handle,
    runtime,
    actor,
    dispatch: sourcedDispatch,
    sourceEventId: sourceEvent.id,
    startedEventId: startedEvent.id,
    handoff
  });
}

async function appendMountedAttemptBinding(
  ledger: EventLedger,
  input: {
    readonly taskId: string;
    readonly runId: string;
    readonly attemptId: `attempt_${string}`;
    readonly actor: { readonly id: string; readonly kind: "agent"; readonly label: string };
  }
): Promise<void> {
  const runType = "timeline-builder" as const;
  const retryGeneration = 0;
  const leaseClaimGeneration = 1;
  const streamId = taskOrchestrationStreamId(input.taskId, runType);
  const taskStream = await ledger.readStream(`agent_task_${input.taskId}`);
  const causationEventId = taskStream.at(-1)?.id;
  if (causationEventId === undefined) throw new Error("mounted task stream is empty");
  const claimStream = await ledger.readStream(streamId);
  const claim = await ledger.append({
    type: "agent.task.orchestration.claimed",
    version: 1,
    streamId,
    context: {
      actor: input.actor,
      occurredAt: sourcedNow,
      correlationId: `corr_${input.taskId}`,
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", agent: "0.1.0" },
      causationId: causationEventId
    },
    payload: {
      taskId: input.taskId,
      runType,
      attemptId: input.attemptId,
      retryGeneration,
      leaseClaimGeneration,
      workerId: input.actor.id,
      claimedAt: sourcedNow,
      leaseExpiresAt: "2026-08-03T13:00:00.000Z",
      idempotencyKey: `task-orchestrator:${input.taskId}:${runType}:0:${input.attemptId}:claim`,
      selectedOrderingPosition: { priorityRank: 0, queuedAt: sourcedNow, taskId: input.taskId, runType, retryGeneration },
      activeBudgetSnapshot: {
        maxProviderInvocations: 1,
        remainingProviderInvocations: 1,
        contextByteBudget: 65_536,
        promptByteBudget: 65_536,
        derivativeArtifactByteBudget: 65_536,
        wallClockBudgetMs: 120_000
      },
      causationEventId
    }
  }, { expectedNextSequence: claimStream.length + 1 });
  const checkpointStream = await ledger.readStream(streamId);
  await ledger.append({
    type: "agent.task.orchestration.checkpointed",
    version: 1,
    streamId,
    context: {
      actor: input.actor,
      occurredAt: sourcedNow,
      correlationId: `corr_${input.taskId}`,
      causationId: claim.id,
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", agent: "0.1.0" }
    },
    payload: {
      taskId: input.taskId,
      runType,
      attemptId: input.attemptId,
      retryGeneration,
      leaseClaimGeneration,
      checkpointKind: "runner-dispatching",
      checkpointedAt: sourcedNow,
      runId: input.runId,
      resumeIdempotencyKey: `task-orchestrator:${input.taskId}:${runType}:0:${input.attemptId}:runner-dispatching`,
      contextBindings: [],
      safeNextActions: ["wait for durable specialist handoff readback"]
    }
  }, { expectedNextSequence: checkpointStream.length + 1 });
}

async function appendMountedModelTranscript(input: {
  readonly ledger: EventLedger;
  readonly actor: { readonly id: string; readonly kind: "agent"; readonly label: string };
  readonly dispatch: {
    readonly approvedRunId: string;
    readonly runType: "timeline-builder";
  };
  readonly startedEventId: string;
  readonly inputArtifactHash: `sha256:${string}`;
}): Promise<void> {
  const invocationId = "inv_mounted_timeline_001";
  const streamId = `agent_model_invocation_${invocationId}`;
  const requested = await input.ledger.append({
    type: "agent.model-invocation.requested",
    version: 1,
    streamId,
    context: {
      actor: input.actor,
      occurredAt: sourcedNow,
      correlationId: `corr_${invocationId}`,
      causationId: input.startedEventId,
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", agent: "0.1.0" }
    },
    payload: {
      invocationId,
      runId: input.dispatch.approvedRunId,
      providerId: "provider_fake_local",
      modelFamily: "fake-local",
      inputArtifactHash: input.inputArtifactHash,
      safetyClass: "workspace-safe",
      credentialRefId: "agent_credref_fake_local",
      credentialKind: "local-no-secret",
      runType: input.dispatch.runType
    }
  }, { expectedNextSequence: 1 });
  await input.ledger.append({
    type: "agent.model-invocation.completed",
    version: 1,
    streamId,
    context: {
      actor: input.actor,
      occurredAt: sourcedNow,
      correlationId: `corr_${invocationId}`,
      causationId: requested.id,
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", agent: "0.1.0" }
    },
    payload: {
      invocationId,
      runId: input.dispatch.approvedRunId,
      providerId: "provider_fake_local",
      outputArtifactHash: hashBytes(Buffer.from(JSON.stringify(sourcedTimelineOutput()), "utf8")),
      completedAt: sourcedNow,
      modelFamily: "fake-local"
    }
  }, { expectedNextSequence: 2 });
}

function mountedSourcedLifecyclePorts(input: {
  readonly workspaceId: string;
  readonly workspaceIdentityEventId: string;
  readonly highWaterMark: string;
  readonly highWaterOrdinal: number;
}): PortableWorkspaceLifecyclePorts {
  const supervisorEpoch = "epoch_sourced_mounted";
  const calls = { reconciliation: 0 };
  return createPortableWorkspaceLifecyclePorts({
    workspaceId: input.workspaceId,
    residentId: "agent_default",
    supervisorEpoch,
    mountedFacts: {
      async read() {
        return {
          ok: true as const,
          facts: {
            schemaVersion: "portable-workspace-mounted-facts.v1" as const,
            workspaceId: input.workspaceId,
            residentId: "agent_default" as const,
            workspaceIdentityEventId: input.workspaceIdentityEventId,
            mountInstanceId: "mount-instance:sourced-timeline",
            mountEvidenceId: "evidence_sourced_mount",
            authorityEvidenceId: "evidence_sourced_authority",
            ledgerStoreEvidenceId: "evidence_sourced_ledger",
            artifactStoreEvidenceId: "evidence_sourced_artifact",
            derivativeStoreEvidenceId: "evidence_sourced_derivative",
            policyVersion: sourcedPolicyVersion,
            policyDigest: hash("d"),
            lockStateDigest: hash("e"),
            policyAndLockReadbackEventId: "evt_sourced_policy_readback",
            highWaterMark: input.highWaterMark,
            highWaterReadbackEventId: "evt_sourced_high_water_readback",
            highWaterOrdinal: input.highWaterOrdinal
          }
        };
      }
    },
    supervisorLease: mountedSourcedLeasePort(input.workspaceId, supervisorEpoch, input),
    activeClaimReconciliation: mountedSourcedReconciliationPort(calls),
    now: () => sourcedNow,
    createSafeOutageObservationId: () => "outage:sourced-mounted"
  });
}

function mountedSourcedLeasePort(
  workspaceId: string,
  supervisorEpoch: string,
  authority: { readonly workspaceIdentityEventId: string; readonly highWaterMark: string }
): DurableSupervisorLeasePort {
  return {
    async readOrAcquire() {
      return {
        outcome: "acquired-and-read-back" as const,
        readback: mountedSourcedLeaseReadback(workspaceId, supervisorEpoch, authority)
      };
    }
  };
}

function mountedSourcedLeaseReadback(
  workspaceId: string,
  supervisorEpoch: string,
  authority: { readonly workspaceIdentityEventId: string; readonly highWaterMark: string }
): SupervisorLeaseReadbackEvidence {
  return {
    schemaVersion: "resident-supervisor-lease-readback.v1",
    workspaceId,
    residentId: "agent_default",
    supervisorEpoch,
    workspaceIdentityEventId: authority.workspaceIdentityEventId,
    mountEvidenceId: "evidence_sourced_mount",
    authorityEvidenceId: "evidence_sourced_authority",
    policyVersion: sourcedPolicyVersion,
    policyDigest: hash("d"),
    lockStateDigest: hash("e"),
    highWaterMark: authority.highWaterMark,
    leaseEventId: "evt_sourced_lease",
    readbackEventId: "evt_sourced_lease_readback",
    expiresAt: "2026-08-03T13:00:00.000Z",
    causation: { causationId: "cause_sourced_mounted", correlationId: "correlation_sourced_mounted" },
    policyAndLock: {
      authorityEvidenceId: "evidence_sourced_authority",
      mountEvidenceId: "evidence_sourced_mount",
      leaseEventId: "evt_sourced_lease",
      leaseReadbackEventId: "evt_sourced_lease_readback",
      policyVersion: sourcedPolicyVersion,
      policyDigest: hash("d"),
      lockStateDigest: hash("e"),
      readbackEventId: "evt_sourced_policy_readback"
    },
    highWater: {
      authorityEvidenceId: "evidence_sourced_authority",
      mountEvidenceId: "evidence_sourced_mount",
      leaseEventId: "evt_sourced_lease",
      leaseReadbackEventId: "evt_sourced_lease_readback",
      highWaterMark: authority.highWaterMark,
      readbackEventId: "evt_sourced_high_water_readback"
    }
  };
}

function mountedSourcedReconciliationPort(
  calls: { reconciliation: number }
): ActiveClaimReconciliationPort {
  return {
    async readByIdempotencyKey() {
      calls.reconciliation += 1;
      return undefined;
    },
    async appendAndReadBack() {
      calls.reconciliation += 1;
      throw new Error("mounted sourced reconciliation is not expected");
    }
  };
}

async function admitMountedSourcedAuthority(
  ports: PortableWorkspaceLifecyclePorts,
  workspaceId: string
): Promise<WorkspaceAdmissionSnapshot> {
  const grant = await ports.authority.revalidate({
    operation: "wake",
    expectedWorkspaceId: workspaceId,
    requiredCapabilities: ["wake", "lifecycle"]
  });
  if (!grant.ok) throw new Error("mounted sourced fixture requires admission");
  const lease = await ports.supervisorLease.readOrAcquire({
    admission: grant.admission,
    residentId: "agent_default",
    supervisorEpoch: "epoch_sourced_mounted",
    policyVersion: sourcedPolicyVersion,
    policyDigest: hash("d"),
    lockStateDigest: hash("e"),
    causationId: "cause_sourced_mounted",
    correlationId: "correlation_sourced_mounted"
  });
  if (lease.outcome !== "acquired-and-read-back") throw new Error("mounted sourced fixture requires lease readback");
  return grant.admission;
}

async function sourcedRunnerAuthority(dispatch: {
  readonly taskId: string;
  readonly attemptId: string;
  readonly runType: string;
}, options: {
  readonly sourceEventId?: string;
  readonly evidenceContentHash?: `sha256:${string}`;
  readonly investigationId?: string;
  readonly workspaceId?: string;
} = {}) {
  if (dispatch.runType !== "timeline-builder") throw new Error("timeline runner fixture only");
  const sourceEventId = options.sourceEventId ?? "evt_timeline_source_001";
  const evidenceContentHash = options.evidenceContentHash ?? hash("a");
  const investigationId = options.investigationId ?? "investigation_runtime_001";
  const registry = createContextPackRegistry();
  registerInvestigativeContextPacks(registry, sourcedInvestigativeRegistration({
    sourceEventId,
    evidenceContentHash,
    investigationId
  }));
  registerOperationalContextPackBuilders(registry, sourcedOperationalProvider(options.workspaceId));
  const scope = { kind: "investigation" as const, refs: [investigationId] };
  const resolvedContextPacks = await Promise.all(
    productionSpecialistPromptRegistrationFor("timeline-builder").contextRequirements
      .filter((requirement) => requirement.requirementMode === "always")
      .map((requirement) => registry.buildResolved(requirement.contextPackId))
  );
  return Object.freeze({
    contextRegistry: registry,
    scope,
    promptArtifact: renderProductionSpecialistPrompt({
      runType: "timeline-builder",
      runId: dispatch.attemptId,
      taskId: dispatch.taskId,
      generatedAt: sourcedNow,
      scope,
      resolvedContextPacks,
      omissions: []
    })
  });
}

function sourcedInvestigativeRegistration(input: {
  readonly sourceEventId: string;
  readonly evidenceContentHash: `sha256:${string}`;
  readonly investigationId: string;
}) {
  const body: InvestigativeSelectionManifestBody = {
    manifestVersion: "investigative-selection-manifest.v1",
    scope: { kind: "investigation", id: input.investigationId },
    sourceProjectionHighWaterMarks: { ingestion: 42, graph: 41, governance: 40, agent: 39 },
    ordering: "ref-kind-ref-id-content-hash-v1",
    window: { cursor: "cursor_runtime_001", offset: 0, limit: 10, stableSort: "ref-kind-ref-id-content-hash-v1" },
    totalEligibleCount: 1,
    includedRefs: [{
      refKind: "evidence",
      refId: "ev_timeline_source_001",
      sortKey: `evidence/ev_timeline_source_001/${input.evidenceContentHash}`,
      contentHash: input.evidenceContentHash,
      sourceEventIds: [input.sourceEventId],
      mandatory: true
    }],
    aggregateOmissions: []
  };
  const manifest = Object.freeze({ ...body, manifestHash: buildSelectionManifestHash(body) });
  const evidence: InvestigativeEvidenceRow = {
    evidenceId: "ev_timeline_source_001",
    ingestionEventId: input.sourceEventId,
    contentHash: input.evidenceContentHash,
    occurrenceIds: [],
    parseJobs: [],
    governanceTags: [],
    safeNarrative: "One date-bearing local source."
  };
  const deps: InvestigativeContextPackDependencies = {
    selection: { capabilityVersion: "investigative-selection.v1", select: async () => manifest },
    evidenceReader: { readEvidenceByIds: async () => [evidence] },
    graphReader: {
      readAcceptedGraphByIds: async () => ({
        assertions: [], entities: [], relationships: [], relationshipProjectionAvailable: true
      })
    },
    governanceReader: { readActiveRestrictionsByIds: async () => [] },
    agentLockReader: { readActiveLocksByIds: async () => [] },
    eventReader: { readEventsByIds: async () => [] },
    evidenceSourcePosture: {
      postureVersion: "ingestion-current-source-posture.v1",
      checkEvidence: async () => ({
        ok: true as const,
        stalenessInputs: [{ kind: "source-byte-current-hash", ref: evidence.evidenceId, value: evidence.contentHash }]
      })
    },
    now: () => sourcedNow,
    policyVersion: sourcedPolicyVersion,
    ontologyCoreVersion: "ontology.v1",
    packVersions: { ingestion: "ingestion.v1" },
    registrationIdentity: investigativeRegistrationIdentity
  };
  return { deps, scope: body.scope, window: body.window };
}

function sourcedOperationalProvider(workspaceId = "ws_runtime_sourced"): OperationalContextPackProvider {
  const scope = { kind: "workspace", id: workspaceId } as const;
  return {
    providerId: "sourced-runner-test-provider",
    capabilities: ["workspace-runtime-status", "task-run-history", "agent-memory-summary"],
    policyVersion: sourcedPolicyVersion,
    generatedAt: sourcedNow,
    scope,
    sizeBudgets: { workspaceRuntimeStatus: 16_384, taskRunHistory: 32_768, agentMemorySummary: 16_384 },
    async workspaceRuntimeStatus() {
      return {
        runtimeHighWaterMark: 42,
        workspaceMounted: true,
        workspaceId: scope.id,
        storageStrategy: "repo-local",
        bindPosture: "loopback",
        authPosture: "local-disabled",
        providerStates: [], diagnostics: [], projectionHighWaterMarks: { agent: 42 }, omissionCodes: []
      };
    },
    async taskRunHistorySnapshot() {
      return emptyOperationalSnapshot("agent.projection.task-run-history", "updatedAt:desc", scope);
    },
    async agentMemorySnapshot() {
      return {
        projectionHighWaterMark: 42,
        projectionSourceRef: "agent.projection.memory",
        activeMemory: [], aggregateCounts: { active: 0, totalCount: 0 }, sourceEventIds: [], artifactHashes: [],
        window: { order: "createdAt:asc", limit: 25, hasMore: false, totalCount: 0, omissionCodes: [] },
        emptyProof: {
          projectionName: "agent.projection.memory", scope, projectionHighWaterMark: 42,
          sourceEventCount: 0, generatedAt: sourcedNow, emptyReasonCode: "empty"
        }
      };
    }
  };
}

function emptyOperationalSnapshot(
  projectionName: string,
  order: "updatedAt:desc",
  scope: { readonly kind: string; readonly id: string }
) {
  return {
    projectionHighWaterMark: 42,
    projectionSourceRef: projectionName,
    tasks: [], runs: [], modelInvocations: [], toolRequests: [], aggregateCounts: { total: 0 },
    sourceEventIds: [], artifactHashes: [],
    window: { order, limit: 25, hasMore: false, totalCount: 0, omissionCodes: [] },
    emptyProof: {
      projectionName, scope, projectionHighWaterMark: 42,
      sourceEventCount: 0, generatedAt: sourcedNow, emptyReasonCode: "empty"
    }
  };
}

function sourcedTimelineOutput(contentHash: `sha256:${string}` = hash("a")) {
  return {
    timelineItems: [{
      itemId: "timeline_runtime_001",
      date: "2026-03-01",
      precision: "day" as const,
      evidenceRefs: ["ev_timeline_source_001"],
      assertionRefs: [],
      prrEventRefs: [],
      contentHashRefs: [contentHash],
      summary: "One exact local source anchors this advisory date.",
      uncertaintyCategories: [],
      uncertaintyNotes: [],
      uncertaintySourceRefs: []
    }],
    omissionReasons: [],
    omittedSources: [],
    unresolvedPrompts: []
  };
}

function sourcedStore() {
  const values = new Map<string, Buffer>();
  let puts = 0;
  return Object.freeze({
    async put(content: Buffer) {
      puts += 1;
      const contentHash = `sha256:${createHash("sha256").update(content).digest("hex")}` as `sha256:${string}`;
      values.set(contentHash, Buffer.from(content));
      return Object.freeze({ contentHash, sizeBytes: content.byteLength });
    },
    async get(contentHash: `sha256:${string}`) {
      const value = values.get(contentHash);
      if (value === undefined) throw new Error("artifact missing");
      return Buffer.from(value);
    },
    putCount: () => puts
  });
}

const sourcedNow = "2026-08-03T12:00:00.000Z";
const sourcedPolicyVersion = "policy.sourced-runner.v1";
