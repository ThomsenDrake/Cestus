import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createContextPackRegistry,
  registerContextPackPayloadParserAuthority,
  serializeContextPackPayload,
  type AgentContextPackJsonValue
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
import { FakeModelProvider } from "../../agent/src/provider.js";
import type { PrrNegotiationFollowUpApprovalPreviewInput } from "../../agent/src/prr-negotiation-workflow.js";
import type { ProviderReadinessDto } from "../../agent/src/provider-readiness.js";
import { buildTaskAttemptId, taskOrchestrationStreamId } from "../../agent/src/task-orchestrator-events.js";
import type {
  ActiveClaimReconciliationPort,
  DurableSupervisorLeasePort,
  SupervisorLeaseReadbackEvidence,
  WorkspaceAdmissionSnapshot
} from "../../agent/src/wake-supervisor.js";
import { FileBlobStore } from "../../ontology/src/blob-store.js";
import type { AppendableKnowledgeEvent, KnowledgeEvent, KnowledgeEventOf } from "../../ontology/src/contracts.js";
import type { EventLedger } from "../../ontology/src/event-ledger.js";
import { SQLiteEventLedger } from "../../ontology/src/sqlite-event-ledger.js";
import { createPortableWorkspace } from "../../workspace/src/index.js";
import {
  consumeMountedSourcedInvestigationDispatch,
  createMountedPrrNegotiationSpecialistRunner,
  createSourcedInvestigationSpecialistRunner,
  createUntrustedSpecialistRunner,
  type UntrustedSpecialistRunner
} from "../src/agent-runtime-specialist-runners.js";
import * as specialistRunnerSurface from "../src/agent-runtime-specialist-runners.js";
import { handleAgentHttpRoute } from "../src/agent-http-routes.js";
import {
  bindMountedAdvisoryHandoffForLocalAgentRuntimeFactory,
  bindMountedSourcedInvestigationHandoffForLocalAgentRuntimeFactory,
  mountedResidentTaskLocalAgentRuntimeFactory
} from "../src/agent-runtime-factory.js";
import { createMountedSourcedInvestigationExecutionPort } from "../src/agent-runtime-mounted-task.js";
import { resolveLocalRuntimeConfig } from "../src/config.js";
import { createMountedPromptArtifactStore } from "../src/mounted-prompt-artifact-store.js";
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
  type ResidentBackgroundExecutionPort,
  type ResidentSupervisionRuntime,
  type WakeSupervisorRuntime
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
const mountedSourcedMultiWorkflowTimeoutMs = 15_000;

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
  }, mountedSourcedMultiWorkflowTimeoutMs);

  it("rebuilds the exact mounted report packet and safe cockpit preview after restart without effects", async () => {
    const fixture = await mountedSourcedResidentFactoryFixture({ canonicalDatedFacts: true });
    const response = await runMountedSourcedResidentRequest(fixture, {
      taskId: fixture.reportTaskId,
      runId: fixture.reportRunId,
      runType: "report-builder",
      evidenceIds: [fixture.evidenceId]
    });
    expect(response.status, response.body).toBe(200);
    const completed = JSON.parse(response.body) as {
      readonly recorded: { readonly manifest: {
        readonly outputArtifacts: readonly { readonly artifactHash: `sha256:${string}` }[];
      } };
      readonly replay: { readonly selectedHandoff?: unknown };
      readonly cockpit: { readonly selectedRun?: { readonly reportPreview?: unknown } };
    };
    const packetHash = completed.recorded.manifest.outputArtifacts[0]!.artifactHash;
    const packetBefore = await readMountedSourcedOutputArtifact(fixture.handle, packetHash);
    expect(packetBefore).toMatchObject({
      schemaVersion: "local-report-packet.v1",
      citationMap: [{
        acceptedAssertionRefs: [fixture.canonicalDatedFacts!.assertionId],
        evidenceCitations: [{ evidenceId: fixture.evidenceId }]
      }],
      truthBoundary: {
        localDerivativeOnly: true,
        exportAllowed: false,
        publicationAllowed: false,
        sensitiveOptInConsumed: false
      }
    });
    expect(completed.cockpit.selectedRun?.reportPreview).toMatchObject({
      schemaVersion: "agent-report-public-safe-preview.v1",
      mode: "preview-only"
    });

    const beforeEvents = await fixture.handle.ledger.readAll();
    expect(beforeEvents.filter((event) => [
      "agent.model-invocation.requested",
      "agent.model-invocation.completed",
      "agent.model-invocation.failed",
      "export.generated",
      "report.generated"
    ].includes(event.type))).toHaveLength(0);
    await fixture.supervision.stop();
    mountedSupervisions.splice(mountedSupervisions.indexOf(fixture.supervision), 1);
    fixture.handle.close();
    mountedHandles.splice(mountedHandles.indexOf(fixture.handle), 1);

    const restarted = createSqlitePrrRuntime({
      config: resolveLocalRuntimeConfig({
        cwd: fixture.workspaceRoot,
        env: {
          CESTUS_LOCAL_STORAGE: "portable-workspace",
          CESTUS_WORKSPACE_ROOT: fixture.workspaceRoot
        }
      }),
      actor: { id: "actor_report_restart", kind: "system", label: "Report Restart" },
      now: fixture.now
    });
    mountedHandles.push(restarted);
    const mounted = restarted.mountedWorkspace;
    if (mounted === undefined) throw new Error("restarted report fixture is not mounted");
    const replayed = await buildSpecialistHandoffProjection({
      events: await restarted.ledger.readAll(),
      manifestReader: new FileBlobStore(join(mounted.paths.derivativeRoot, "specialist-handoff-manifest")),
      runId: fixture.reportRunId,
      taskId: fixture.reportTaskId
    });
    const packetAfter = await readMountedSourcedOutputArtifact(restarted, packetHash);
    const cockpitResponse = await handleAgentHttpRoute({
      request: { method: "GET", url: "/api/agent/cockpit" },
      handle: restarted,
      actor: { id: "actor_report_restart", kind: "system", label: "Report Restart" },
      now: fixture.now,
      agentRuntimeFactory: mountedResidentTaskLocalAgentRuntimeFactory
    });
    if (cockpitResponse === undefined) throw new Error("restarted report cockpit route was not reached");
    const cockpit = JSON.parse(cockpitResponse.body) as {
      readonly selectedRun?: { readonly reportPreview?: unknown };
    };

    expect(replayed.state).toBe("task-completed");
    expect(replayed.selectedHandoff).toEqual(completed.replay.selectedHandoff);
    expect(packetAfter).toEqual(packetBefore);
    expect(cockpit.selectedRun?.reportPreview).toEqual(completed.cockpit.selectedRun?.reportPreview);
    expect(JSON.stringify(cockpit)).not.toMatch(/mounted resident sourced evidence bytes|authorization:|provider body|private mailbox body/i);
  }, mountedSourcedMultiWorkflowTimeoutMs);

  it("reaches planner and PRR advice through the production mounted resident HTTP caller", async () => {
    const plannerFixture = await mountedSourcedResidentFactoryFixture();
    const prrFixture = await mountedSourcedResidentFactoryFixture();

    const invalidPlanner = await runMountedAdvisoryResidentRequest(plannerFixture, plannerFixture.plannerTaskId, {
      runId: plannerFixture.plannerRunId,
      runType: "investigation-planner",
      investigationId: "inv_sourced_factory_001",
      evidenceIds: [plannerFixture.evidenceId]
    });
    const invalidPrr = await runMountedAdvisoryResidentRequest(prrFixture, prrFixture.prrTaskId, {
      runId: prrFixture.prrRunId,
      runType: "prr-negotiation",
      prrRequestId: "prr_req_sourced_factory_001",
      jurisdictionRuleRefs: [
        "jurisdiction-rule:us-federal-foia@0.1.0:federal-determination-20-working-days"
      ],
      investigationId: "inv_extraneous_001"
    });
    expect(invalidPlanner.status).toBe(400);
    expect(invalidPrr.status).toBe(400);

    const [planner, prr] = await Promise.all([
      runMountedAdvisoryResidentRequest(plannerFixture, plannerFixture.plannerTaskId, {
        runId: plannerFixture.plannerRunId,
        runType: "investigation-planner",
        investigationId: "inv_sourced_factory_001"
      }),
      runMountedAdvisoryResidentRequest(prrFixture, prrFixture.prrTaskId, {
        runId: prrFixture.prrRunId,
        runType: "prr-negotiation",
        prrRequestId: "prr_req_sourced_factory_001",
        correspondenceId: "corr_prr_sourced_factory_001",
        jurisdictionRuleRefs: [
          "jurisdiction-rule:us-federal-foia@0.1.0:federal-determination-20-working-days"
        ]
      })
    ]);

    expect(planner.status, planner.body).toBe(200);
    expect(JSON.parse(planner.body)).toMatchObject({
      cockpit: { selectedRun: { runType: "investigation-planner", state: "completed" } }
    });
    expect(prr.status, prr.body).toBe(200);
    expect(JSON.parse(prr.body)).toMatchObject({
      cockpit: { selectedRun: { runType: "prr-negotiation", state: "completed" } }
    });
    for (const fixture of [plannerFixture, prrFixture]) {
      const types = (await fixture.handle.ledger.readAll()).map((event) => event.type);
      expect(types.filter((type) => type === "agent.specialist-handoff.recorded")).toHaveLength(1);
      expect(types).not.toEqual(expect.arrayContaining([
        "agent.tool.executed",
        "agent.tool.completed",
        "prr.followup.sent",
        "prr.legal-escalation.confirmed"
      ]));
    }
  }, mountedSourcedMultiWorkflowTimeoutMs);

  it("fails cockpit replay when canonical manifest material is absent even if material storage remains intact", async () => {
    const fixture = await mountedSourcedResidentFactoryFixture();
    const response = await fixture.supervision.executeSourcedInvestigation({
      taskId: fixture.plannerTaskId,
      runId: fixture.plannerRunId,
      runType: "investigation-planner",
      investigationId: "inv_sourced_factory_001"
    }) as { readonly cockpit: { readonly selectedRun?: { readonly handoff?: unknown } } };
    expect(response.cockpit.selectedRun?.handoff).toBeDefined();
    const finalOutput = (await fixture.handle.ledger.readAll()).find((event) =>
      event.type === "agent.specialist-run.step.recorded" &&
      event.payload.runId === fixture.plannerRunId && event.payload.stepKind === "final-output"
    );
    if (finalOutput?.type !== "agent.specialist-run.step.recorded" ||
      finalOutput.payload.handoffMaterialArtifactHash === undefined) {
      throw new Error("planner final-output material hash is unavailable");
    }
    const mounted = fixture.handle.mountedWorkspace;
    if (mounted === undefined) throw new Error("planner workspace is unavailable");
    const materialHash = finalOutput.payload.handoffMaterialArtifactHash as `sha256:${string}`;
    await expect(new FileBlobStore(join(
      mounted.paths.derivativeRoot,
      "specialist-handoff-material"
    )).get(materialHash)).resolves.toBeInstanceOf(Buffer);
    unlinkSync(mountedArtifactPath(
      join(mounted.paths.derivativeRoot, "specialist-handoff-manifest"),
      materialHash
    ));

    const cockpit = await handleAgentHttpRoute({
      request: { method: "GET", url: "/api/agent/cockpit" },
      handle: fixture.handle,
      actor: { id: "actor_manifest_replay", kind: "system", label: "Manifest Replay" },
      now: fixture.now,
      supervision: fixture.supervision,
      agentRuntimeFactory: mountedResidentTaskLocalAgentRuntimeFactory
    });
    expect(cockpit?.status, cockpit?.body).toBe(200);
    expect(JSON.parse(cockpit!.body).selectedRun).not.toHaveProperty("handoff");
  });

  it("binds mounted planner gaps to prior canonical timeline and contradiction artifact IDs", async () => {
    const fixture = await mountedSourcedResidentFactoryFixture({
      canonicalDatedFacts: true,
      secondEvidence: "conflicting-assertion",
      contradictionIncludesSecondEvidence: true
    });
    if (fixture.secondEvidenceId === undefined) throw new Error("second planner evidence is unavailable");
    const evidenceIds = [fixture.evidenceId, fixture.secondEvidenceId];
    const invalidScopedTimeline = await runMountedAdvisoryResidentRequest(fixture, fixture.timelineTaskId, {
      runId: fixture.timelineRunId,
      runType: "timeline-builder",
      investigationId: "inv_sourced_factory_001",
      evidenceIds,
      prrRequestId: "prr_req_extraneous"
    });
    expect(invalidScopedTimeline.status).toBe(400);
    const timelineResponse = await runMountedSourcedResidentRequest(fixture, {
      taskId: fixture.timelineTaskId,
      runId: fixture.timelineRunId,
      runType: "timeline-builder",
      investigationId: "inv_sourced_factory_001",
      evidenceIds
    });
    expect(timelineResponse.status, timelineResponse.body).toBe(200);
    const timelineEnvelope = JSON.parse(timelineResponse.body) as {
      readonly recorded: {
        readonly manifest: {
          readonly investigationId?: string;
          readonly outputArtifacts: readonly { readonly artifactHash: `sha256:${string}` }[];
        };
        readonly handoff: { readonly investigationId?: string };
      };
    };
    expect(timelineEnvelope.recorded.manifest.investigationId).toBe("inv_sourced_factory_001");
    expect(timelineEnvelope.recorded.handoff.investigationId).toBe("inv_sourced_factory_001");
    const timelineArtifact = await readMountedSourcedOutputArtifact(
      fixture.handle,
      timelineEnvelope.recorded.manifest.outputArtifacts[0]!.artifactHash
    );
    fixture.advancePastLeaseExpiry();
    const contradictionResponse = await runMountedSourcedResidentRequest(fixture, {
      taskId: fixture.contradictionTaskId,
      runId: fixture.contradictionRunId,
      runType: "contradiction-finder",
      investigationId: "inv_sourced_factory_001",
      evidenceIds
    });
    expect(contradictionResponse.status, contradictionResponse.body).toBe(200);
    const contradictionEnvelope = JSON.parse(contradictionResponse.body) as {
      readonly recorded: {
        readonly manifest: {
          readonly investigationId?: string;
          readonly outputArtifacts: readonly { readonly artifactHash: `sha256:${string}` }[];
        };
        readonly handoff: { readonly investigationId?: string };
      };
    };
    expect(contradictionEnvelope.recorded.manifest.investigationId).toBe("inv_sourced_factory_001");
    expect(contradictionEnvelope.recorded.handoff.investigationId).toBe("inv_sourced_factory_001");
    const contradictionArtifact = await readMountedSourcedOutputArtifact(
      fixture.handle,
      contradictionEnvelope.recorded.manifest.outputArtifacts[0]!.artifactHash
    );
    fixture.advancePastLeaseExpiry();
    const planner = await fixture.supervision.executeSourcedInvestigation({
      taskId: fixture.plannerTaskId,
      runId: fixture.plannerRunId,
      runType: "investigation-planner",
      investigationId: "inv_sourced_factory_001"
    }) as { readonly recorded: { readonly handoff: { readonly outputArtifacts: readonly {
      readonly artifactKind: string;
      readonly artifactHash: `sha256:${string}`;
    }[] } } };
    const planHash = planner.recorded.handoff.outputArtifacts.find((artifact) =>
      artifact.artifactKind === "investigation-plan-artifact"
    )?.artifactHash;
    if (planHash === undefined) throw new Error("mounted planner artifact is unavailable");
    const plan = await readMountedSourcedOutputArtifact(fixture.handle, planHash);
    const timelineIds = (timelineArtifact.items as readonly { readonly itemId: string }[]).map((item) => item.itemId);
    const contradictionIds = (contradictionArtifact.candidates as readonly { readonly candidateId: string }[])
      .map((candidate) => candidate.candidateId);
    expect(timelineArtifact.investigationId).toBe("inv_sourced_factory_001");
    expect(contradictionArtifact.investigationId).toBe("inv_sourced_factory_001");
    const sourcedRunStarts = (await fixture.handle.ledger.readAll()).filter((event):
      event is KnowledgeEventOf<"agent.specialist-run.started"> =>
      event.type === "agent.specialist-run.started" &&
      (event.payload.runId === fixture.timelineRunId || event.payload.runId === fixture.contradictionRunId)
    );
    expect(sourcedRunStarts).toHaveLength(2);
    expect(sourcedRunStarts.every((event) => event.payload.investigationId === "inv_sourced_factory_001")).toBe(true);
    expect(timelineIds.length).toBeGreaterThan(0);
    expect(contradictionIds.length).toBeGreaterThan(0);
    expect(plan).toMatchObject({
      prioritizedGaps: [expect.objectContaining({
        timelineRefs: expect.arrayContaining(timelineIds),
        contradictionRefs: expect.arrayContaining(contradictionIds)
      })]
    });
  }, mountedSourcedMultiWorkflowTimeoutMs);

  it("does not relabel exact-evidence timeline or contradiction artifacts across investigations", async () => {
    const fixture = await mountedSourcedResidentFactoryFixture({
      canonicalDatedFacts: true,
      secondEvidence: "conflicting-assertion",
      contradictionIncludesSecondEvidence: true
    });
    if (fixture.secondEvidenceId === undefined) throw new Error("second planner evidence is unavailable");
    const evidenceIds = [fixture.evidenceId, fixture.secondEvidenceId];
    const timeline = await runMountedSourcedResidentRequest(fixture, {
      taskId: fixture.timelineTaskId,
      runId: fixture.timelineRunId,
      runType: "timeline-builder",
      investigationId: "inv_sourced_factory_001",
      evidenceIds
    });
    expect(timeline.status, timeline.body).toBe(200);
    fixture.advancePastLeaseExpiry();
    const contradiction = await runMountedSourcedResidentRequest(fixture, {
      taskId: fixture.contradictionTaskId,
      runId: fixture.contradictionRunId,
      runType: "contradiction-finder",
      investigationId: "inv_sourced_factory_001",
      evidenceIds
    });
    expect(contradiction.status, contradiction.body).toBe(200);
    fixture.advancePastLeaseExpiry();

    const planner = await fixture.supervision.executeSourcedInvestigation({
      taskId: fixture.plannerTaskId,
      runId: fixture.plannerRunId,
      runType: "investigation-planner",
      investigationId: "inv_sourced_factory_002"
    }) as { readonly recorded: { readonly handoff: { readonly outputArtifacts: readonly {
      readonly artifactKind: string;
      readonly artifactHash: `sha256:${string}`;
    }[] } } };
    const planHash = planner.recorded.handoff.outputArtifacts.find((artifact) =>
      artifact.artifactKind === "investigation-plan-artifact"
    )?.artifactHash;
    if (planHash === undefined) throw new Error("mounted planner artifact is unavailable");
    const plan = await readMountedSourcedOutputArtifact(fixture.handle, planHash);
    expect(plan).toMatchObject({
      investigationId: "inv_sourced_factory_002",
      prioritizedGaps: [expect.objectContaining({
        timelineRefs: [],
        contradictionRefs: []
      })]
    });
  }, mountedSourcedMultiWorkflowTimeoutMs);

  it("does not relabel legacy unscoped timeline or contradiction artifacts into a planner investigation", async () => {
    const fixture = await mountedSourcedResidentFactoryFixture({
      canonicalDatedFacts: true,
      secondEvidence: "conflicting-assertion",
      contradictionIncludesSecondEvidence: true
    });
    if (fixture.secondEvidenceId === undefined) throw new Error("second planner evidence is unavailable");
    const evidenceIds = [fixture.evidenceId, fixture.secondEvidenceId];
    const timeline = await runMountedSourcedResidentRequest(fixture, {
      taskId: fixture.timelineTaskId,
      runId: fixture.timelineRunId,
      runType: "timeline-builder",
      evidenceIds
    });
    expect(timeline.status, timeline.body).toBe(200);
    fixture.advancePastLeaseExpiry();
    const contradiction = await runMountedSourcedResidentRequest(fixture, {
      taskId: fixture.contradictionTaskId,
      runId: fixture.contradictionRunId,
      runType: "contradiction-finder",
      evidenceIds
    });
    expect(contradiction.status, contradiction.body).toBe(200);
    fixture.advancePastLeaseExpiry();

    const planner = await fixture.supervision.executeSourcedInvestigation({
      taskId: fixture.plannerTaskId,
      runId: fixture.plannerRunId,
      runType: "investigation-planner",
      investigationId: "inv_sourced_factory_001"
    }) as { readonly recorded: { readonly handoff: { readonly outputArtifacts: readonly {
      readonly artifactKind: string;
      readonly artifactHash: `sha256:${string}`;
    }[] } } };
    const planHash = planner.recorded.handoff.outputArtifacts.find((artifact) =>
      artifact.artifactKind === "investigation-plan-artifact"
    )?.artifactHash;
    if (planHash === undefined) throw new Error("mounted planner artifact is unavailable");
    const plan = await readMountedSourcedOutputArtifact(fixture.handle, planHash);
    expect(plan).toMatchObject({
      investigationId: "inv_sourced_factory_001",
      prioritizedGaps: [expect.objectContaining({
        timelineRefs: [],
        contradictionRefs: []
      })]
    });
  }, mountedSourcedMultiWorkflowTimeoutMs);

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
        evidence: [],
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
  }, mountedSourcedMultiWorkflowTimeoutMs);

  it("produces an advisory contradiction candidate from two exact conflicting ledger assertions", async () => {
    const fixture = await mountedSourcedResidentFactoryFixture({
      canonicalDatedFacts: true,
      secondEvidence: "conflicting-assertion"
    });
    if (fixture.canonicalDatedFacts === undefined || fixture.secondEvidenceId === undefined ||
      fixture.secondEvidenceFacts?.assertionId === undefined) {
      throw new Error("exact conflicting assertion histories are unavailable");
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
    const response = JSON.parse(contradiction.body) as {
      readonly recorded: { readonly manifest: {
        readonly outputArtifacts: readonly { readonly artifactHash: `sha256:${string}` }[];
      } };
    };
    const artifact = await readMountedSourcedOutputArtifact(
      fixture.handle,
      response.recorded.manifest.outputArtifacts[0]!.artifactHash
    );
    expect(artifact).toMatchObject({
      schemaVersion: "contradiction-candidate-dossier.v1",
      candidates: [expect.objectContaining({
        category: "direct-conflict",
        comparedSourceRefs: expect.arrayContaining([
          fixture.evidenceId,
          fixture.secondEvidenceId,
          fixture.canonicalDatedFacts.assertionId,
          fixture.secondEvidenceFacts.assertionId,
          `timeline_assertion_${fixture.canonicalDatedFacts.assertionId}`,
          `timeline_assertion_${fixture.secondEvidenceFacts.assertionId}`
        ]),
        evidence: expect.arrayContaining([
          expect.objectContaining({ evidenceId: fixture.evidenceId }),
          expect.objectContaining({ evidenceId: fixture.secondEvidenceId })
        ]),
        assertions: expect.arrayContaining([
          expect.objectContaining({ assertionId: fixture.canonicalDatedFacts.assertionId }),
          expect.objectContaining({ assertionId: fixture.secondEvidenceFacts.assertionId })
        ]),
        timelineItems: expect.arrayContaining([
          expect.objectContaining({ itemId: `timeline_assertion_${fixture.canonicalDatedFacts.assertionId}` }),
          expect.objectContaining({ itemId: `timeline_assertion_${fixture.secondEvidenceFacts.assertionId}` })
        ]),
        confidenceCaveat: expect.stringMatching(/advisory|review|scope|date/i),
        rationale: expect.stringMatching(/different|conflict/i),
        alternativeExplanations: [expect.any(String)],
        requestedFollowupEvidence: [expect.any(String)],
        requiredReviewerAction: "review"
      })]
    });
  }, mountedSourcedMultiWorkflowTimeoutMs);

  it("rejects a mounted contradiction comparison whose distinct evidence IDs resolve to the same exact source bytes", async () => {
    const fixture = await mountedSourcedResidentFactoryFixture({
      canonicalDatedFacts: true,
      secondEvidence: "conflicting-assertion",
      secondEvidenceSameSourceBytes: true
    });
    if (fixture.secondEvidenceId === undefined) throw new Error("same-byte evidence fixture is unavailable");
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

    expect(contradiction.status, contradiction.body).toBe(409);
    expect((await fixture.handle.ledger.readAll()).some((event) =>
      event.type === "agent.specialist-handoff.recorded" &&
      event.payload.runId === fixture.contradictionRunId
    )).toBe(false);
  }, mountedSourcedMultiWorkflowTimeoutMs);

  it("does not emit a contradiction for semantically identical numeric zero values", async () => {
    const fixture = await mountedSourcedResidentFactoryFixture({
      canonicalDatedFacts: true,
      canonicalAssertionObject: 0,
      secondEvidence: "conflicting-assertion",
      secondAssertionObject: -0
    });
    if (fixture.secondEvidenceId === undefined) throw new Error("numeric assertion fixture is unavailable");
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
    const response = JSON.parse(contradiction.body) as {
      readonly recorded: { readonly manifest: {
        readonly outputArtifacts: readonly { readonly artifactHash: `sha256:${string}` }[];
      } };
    };
    await expect(readMountedSourcedOutputArtifact(
      fixture.handle,
      response.recorded.manifest.outputArtifacts[0]!.artifactHash
    )).resolves.toMatchObject({ candidates: [] });
  }, mountedSourcedMultiWorkflowTimeoutMs);

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
  }, mountedSourcedMultiWorkflowTimeoutMs);

  it("rejects a prior timeline that does not exactly account for every currently selected source", async () => {
    const fixture = await mountedSourcedResidentFactoryFixture({
      canonicalDatedFacts: true,
      secondEvidence: "undated",
      contradictionIncludesSecondEvidence: true
    });
    if (fixture.secondEvidenceId === undefined) {
      throw new Error("strict selected-source coverage fixture is unavailable");
    }
    const timeline = await runMountedSourcedResidentRequest(fixture, {
      taskId: fixture.timelineTaskId,
      runId: fixture.timelineRunId,
      runType: "timeline-builder",
      evidenceIds: [fixture.evidenceId]
    });
    expect(timeline.status, timeline.body).toBe(200);

    fixture.advancePastLeaseExpiry();
    const contradiction = await runMountedSourcedResidentRequest(fixture, {
      taskId: fixture.contradictionTaskId,
      runId: fixture.contradictionRunId,
      runType: "contradiction-finder",
      evidenceIds: [fixture.evidenceId, fixture.secondEvidenceId]
    });
    expect(contradiction.status).toBe(409);
    expect(JSON.parse(contradiction.body)).toMatchObject({
      diagnostic: { message: expect.stringMatching(/exactly one replayable timeline relevant/i) }
    });
  }, mountedSourcedMultiWorkflowTimeoutMs);

  it("fails closed when two replayable timelines are relevant to the selected evidence", async () => {
    const fixture = await mountedSourcedResidentFactoryFixture({
      canonicalDatedFacts: true,
      secondEvidence: "accepted-assertion",
      unrelatedTimelineIncludesFirstEvidence: true
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
      evidenceIds: selectedEvidenceIds
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
  }, mountedSourcedMultiWorkflowTimeoutMs);

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

  it("does not admit an ordinary background execution over an active sourced cancellation fence", async () => {
    const promptBoundaryEntered = Promise.withResolvers<void>();
    const releasePromptBoundary = Promise.withResolvers<void>();
    const backgroundScanEntered = Promise.withResolvers<void>();
    const releaseOrdinary = Promise.withResolvers<void>();
    let offerOrdinary = false;
    let ordinaryOffered = false;
    let ordinaryEntered = false;
    const backgroundExecution: ResidentBackgroundExecutionPort = {
      async pendingLocalTasks() {
        if (!offerOrdinary || ordinaryOffered) return [];
        ordinaryOffered = true;
        backgroundScanEntered.resolve();
        return [{ taskId: "task_sourced_factory_ordinary_race", runId: "run_sourced_factory_ordinary_race" }];
      },
      async execute() {
        ordinaryEntered = true;
        await releaseOrdinary.promise;
      }
    };
    const fixture = await mountedSourcedResidentFactoryFixture({
      backgroundExecution,
      beforePromptArtifactWriteForTest: async () => {
        promptBoundaryEntered.resolve();
        await releasePromptBoundary.promise;
      }
    });
    const controller = createMountedSourcedCancellationController(fixture, "ordinary_race");
    const execution = runMountedSourcedResidentRequest(fixture, {
      taskId: fixture.timelineTaskId,
      runId: fixture.timelineRunId,
      runType: "timeline-builder",
      evidenceIds: [fixture.evidenceId]
    });
    await promptBoundaryEntered.promise;
    offerOrdinary = true;
    fixture.supervision.signalLocalAdmission();
    await Promise.race([
      backgroundScanEntered.promise,
      new Promise<void>((resolve) => setTimeout(resolve, 25))
    ]);
    await new Promise<void>((resolve) => setImmediate(resolve));

    let cancelSettled = false;
    const cancellation = cancelMountedSourcedTask(fixture, controller).then((response) => {
      cancelSettled = true;
      return response;
    });
    await waitForMountedLedgerEvent(controller.handle, (event) =>
      event.type === "agent.task.status.changed" &&
      event.payload.taskId === fixture.timelineTaskId && event.payload.status === "canceled"
    );
    await Promise.resolve();
    const observedBeforeRelease = { ordinaryEntered, cancelSettled };
    releaseOrdinary.resolve();
    releasePromptBoundary.resolve();
    const [canceled, sourced] = await Promise.all([cancellation, execution]);

    expect(observedBeforeRelease).toEqual({ ordinaryEntered: false, cancelSettled: false });
    expect(canceled?.status, canceled?.body).toBe(200);
    expect(sourced.status).toBe(409);
  });

  it("serializes an in-flight mounted artifact write before the durable cancellation fence", async () => {
    const promptBoundaryEntered = Promise.withResolvers<void>();
    const releasePromptBoundary = Promise.withResolvers<void>();
    const fixture = await mountedSourcedResidentFactoryFixture({
      beforePromptArtifactWriteForTest: async () => {
        promptBoundaryEntered.resolve();
        await releasePromptBoundary.promise;
      }
    });
    const controller = createMountedSourcedCancellationController(fixture, "inflight_write");
    const writeEntered = Promise.withResolvers<void>();
    const releaseWrite = Promise.withResolvers<void>();
    const originalPut = FileBlobStore.prototype.put;
    let interceptNextPut = true;
    const execution = runMountedSourcedResidentRequest(fixture, {
      taskId: fixture.timelineTaskId,
      runId: fixture.timelineRunId,
      runType: "timeline-builder",
      evidenceIds: [fixture.evidenceId]
    });
    await promptBoundaryEntered.promise;
    const putSpy = vi.spyOn(FileBlobStore.prototype, "put").mockImplementation(async function (
      this: FileBlobStore,
      content: Buffer
    ) {
      if (interceptNextPut) {
        interceptNextPut = false;
        writeEntered.resolve();
        await releaseWrite.promise;
      }
      return await originalPut.call(this, content);
    });
    releasePromptBoundary.resolve();
    await writeEntered.promise;
    const cancellation = cancelMountedSourcedTask(fixture, controller);
    let snapshotAtCancellation: readonly string[] | undefined;
    try {
      const canceledBeforeRelease = await Promise.race([
        waitForMountedLedgerEvent(controller.handle, (event) =>
          event.type === "agent.task.status.changed" &&
          event.payload.taskId === fixture.timelineTaskId && event.payload.status === "canceled"
        ).then(() => true),
        new Promise<false>((resolve) => setTimeout(() => resolve(false), 25))
      ]);
      if (canceledBeforeRelease) {
        snapshotAtCancellation = mountedSourcedArtifactSnapshot(fixture.handle);
      }
      releaseWrite.resolve();
      if (!canceledBeforeRelease) {
        await waitForMountedLedgerEvent(controller.handle, (event) =>
          event.type === "agent.task.status.changed" &&
          event.payload.taskId === fixture.timelineTaskId && event.payload.status === "canceled"
        );
        snapshotAtCancellation = mountedSourcedArtifactSnapshot(fixture.handle);
      }
      const [canceled, sourced] = await Promise.all([cancellation, execution]);
      expect(canceled?.status, canceled?.body).toBe(200);
      expect(mountedSourcedArtifactSnapshot(fixture.handle)).toEqual(snapshotAtCancellation);
      expect(sourced.status, sourced.body).toBe(409);
    } finally {
      releaseWrite.resolve();
      putSpy.mockRestore();
    }
  });

  it("uses one mounted task gate across a real portable-workspace symlink alias", async () => {
    const promptBoundaryEntered = Promise.withResolvers<void>();
    const releasePromptBoundary = Promise.withResolvers<void>();
    const fixture = await mountedSourcedResidentFactoryFixture({
      beforePromptArtifactWriteForTest: async () => {
        promptBoundaryEntered.resolve();
        await releasePromptBoundary.promise;
      }
    });
    const aliasParent = mkdtempSync(join(tmpdir(), "cestus-sourced-alias-"));
    mountedTempDirs.push(aliasParent);
    const aliasParentLink = join(aliasParent, "portable-parent-alias");
    symlinkSync(dirname(fixture.workspaceRoot), aliasParentLink, "dir");
    const aliasRoot = join(aliasParentLink, basename(fixture.workspaceRoot));
    const controller = createMountedSourcedCancellationController({
      ...fixture,
      workspaceRoot: aliasRoot
    }, "symlink_alias");
    const writeEntered = Promise.withResolvers<void>();
    const releaseWrite = Promise.withResolvers<void>();
    const originalPut = FileBlobStore.prototype.put;
    let interceptNextPut = true;
    const execution = runMountedSourcedResidentRequest(fixture, {
      taskId: fixture.timelineTaskId,
      runId: fixture.timelineRunId,
      runType: "timeline-builder",
      evidenceIds: [fixture.evidenceId]
    });
    await promptBoundaryEntered.promise;
    const putSpy = vi.spyOn(FileBlobStore.prototype, "put").mockImplementation(async function (
      this: FileBlobStore,
      content: Buffer
    ) {
      if (interceptNextPut) {
        interceptNextPut = false;
        writeEntered.resolve();
        await releaseWrite.promise;
      }
      return await originalPut.call(this, content);
    });
    releasePromptBoundary.resolve();
    await writeEntered.promise;
    const cancellation = cancelMountedSourcedTask(fixture, controller);
    try {
      const canceledBeforeRelease = await Promise.race([
        waitForMountedLedgerEvent(controller.handle, (event) =>
          event.type === "agent.task.status.changed" &&
          event.payload.taskId === fixture.timelineTaskId && event.payload.status === "canceled"
        ).then(() => true),
        new Promise<false>((resolve) => setTimeout(() => resolve(false), 25))
      ]);
      expect(canceledBeforeRelease).toBe(false);
      releaseWrite.resolve();
      const [canceled, sourced] = await Promise.all([cancellation, execution]);
      expect(canceled?.status, canceled?.body).toBe(200);
      expect(sourced.status, sourced.body).toBe(409);
    } finally {
      releaseWrite.resolve();
      putSpy.mockRestore();
    }
  });

  it("serializes a direct terminal handoff-store write before sourced cancellation", async () => {
    const promptBoundaryEntered = Promise.withResolvers<void>();
    const releasePromptBoundary = Promise.withResolvers<void>();
    const fixture = await mountedSourcedResidentFactoryFixture({
      beforePromptArtifactWriteForTest: async () => {
        promptBoundaryEntered.resolve();
        await releasePromptBoundary.promise;
      }
    });
    const controller = createMountedSourcedCancellationController(fixture, "terminal_store");
    const terminalWriteEntered = Promise.withResolvers<void>();
    const releaseTerminalWrite = Promise.withResolvers<void>();
    const originalPut = FileBlobStore.prototype.put;
    let intercepted = false;
    const execution = runMountedSourcedResidentRequest(fixture, {
      taskId: fixture.timelineTaskId,
      runId: fixture.timelineRunId,
      runType: "timeline-builder",
      evidenceIds: [fixture.evidenceId]
    });
    await promptBoundaryEntered.promise;
    const putSpy = vi.spyOn(FileBlobStore.prototype, "put").mockImplementation(async function (
      this: FileBlobStore,
      content: Buffer
    ) {
      const rootDir = Reflect.get(this, "rootDir");
      if (!intercepted && typeof rootDir === "string" && rootDir.endsWith("specialist-handoff-manifest")) {
        intercepted = true;
        terminalWriteEntered.resolve();
        await releaseTerminalWrite.promise;
      }
      return await originalPut.call(this, content);
    });
    releasePromptBoundary.resolve();
    await terminalWriteEntered.promise;
    const cancellation = cancelMountedSourcedTask(fixture, controller);
    try {
      const canceledBeforeRelease = await Promise.race([
        waitForMountedLedgerEvent(controller.handle, (event) =>
          event.type === "agent.task.status.changed" &&
          event.payload.taskId === fixture.timelineTaskId && event.payload.status === "canceled"
        ).then(() => true),
        new Promise<false>((resolve) => setTimeout(() => resolve(false), 25))
      ]);
      expect(canceledBeforeRelease).toBe(false);
      releaseTerminalWrite.resolve();
      const [canceled, sourced] = await Promise.all([cancellation, execution]);
      expect(canceled?.status, canceled?.body).toBe(200);
      expect(sourced.status, sourced.body).toBe(409);
    } finally {
      releaseTerminalWrite.resolve();
      putSpy.mockRestore();
    }
  });

  it("fences the pre-run orchestration claim and checkpoint against sourced cancellation", async () => {
    const fixture = await mountedSourcedResidentFactoryFixture();
    const controller = createMountedSourcedCancellationController(fixture, "pre_run_ledger");
    const checkpointEntered = Promise.withResolvers<void>();
    const releaseCheckpoint = Promise.withResolvers<void>();
    const originalGuardedAppend = SQLiteEventLedger.prototype.appendWithPrecommitGuard;
    let intercepted = false;
    SQLiteEventLedger.prototype.appendWithPrecommitGuard = async function (event, options, guard) {
      if (!intercepted && event.type === "agent.task.orchestration.checkpointed" &&
        event.payload.taskId === fixture.timelineTaskId) {
        intercepted = true;
        checkpointEntered.resolve();
        await releaseCheckpoint.promise;
      }
      return await originalGuardedAppend.call(this, event, options, guard);
    };
    const execution = runMountedSourcedResidentRequest(fixture, {
      taskId: fixture.timelineTaskId,
      runId: fixture.timelineRunId,
      runType: "timeline-builder",
      evidenceIds: [fixture.evidenceId]
    });
    await checkpointEntered.promise;
    const claimEvents = await controller.handle.ledger.readAll();
    expect(claimEvents.some((event) => event.type === "agent.task.orchestration.claimed" &&
      event.payload.taskId === fixture.timelineTaskId)).toBe(true);
    const cancellation = cancelMountedSourcedTask(fixture, controller);
    try {
      const canceledBeforeRelease = await Promise.race([
        waitForMountedLedgerEvent(controller.handle, (event) =>
          event.type === "agent.task.status.changed" &&
          event.payload.taskId === fixture.timelineTaskId && event.payload.status === "canceled"
        ).then(() => true),
        new Promise<false>((resolve) => setTimeout(() => resolve(false), 25))
      ]);
      expect(canceledBeforeRelease).toBe(false);
      releaseCheckpoint.resolve();
      const [canceled, sourced] = await Promise.all([cancellation, execution]);
      expect(canceled?.status, canceled?.body).toBe(200);
      expect(sourced.status, sourced.body).toBe(409);
      const events = await controller.handle.ledger.readAll();
      const canceledIndex = events.findIndex((event) => event.type === "agent.task.status.changed" &&
        event.payload.taskId === fixture.timelineTaskId && event.payload.status === "canceled");
      expect(events.slice(canceledIndex + 1).some((event) =>
        event.type === "agent.task.orchestration.checkpointed" &&
        event.payload.taskId === fixture.timelineTaskId
      )).toBe(false);
    } finally {
      releaseCheckpoint.resolve();
      SQLiteEventLedger.prototype.appendWithPrecommitGuard = originalGuardedAppend;
    }
  });

  it("forgets a sourced wake identity whose startup is blocked before a later retry", async () => {
    const fixture = await mountedSourcedResidentFactoryFixture();
    await fixture.supervision.snapshot();
    const contender = createResidentSupervisionRuntime({
      runtimeHandle: fixture.handle,
      actor: { id: "agent_default", kind: "agent", label: "Cestus Agent" },
      now: fixture.now,
      createSupervisorOwnerId: () => "owner_sourced_blocked_retry",
      issueMountedSourcedInvestigationHandoff: async (wakeRuntime, task) => {
        if (task.runType !== "timeline-builder" && task.runType !== "contradiction-finder") {
          throw new Error("blocked-retry fixture accepts only sourced-investigation tasks");
        }
        return await bindMountedSourcedInvestigationHandoffForLocalAgentRuntimeFactory({
          wakeRuntime,
          taskId: task.taskId,
          runId: task.runId,
          runType: task.runType,
          ...(task.investigationId === undefined ? {} : { investigationId: task.investigationId })
        });
      },
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
  }, mountedSourcedMultiWorkflowTimeoutMs);

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
      stores: {
        material: fixture.handoff.binding.materialStore,
        manifest: fixture.handoff.binding.manifestStore
      },
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

  it("composes mounted PRR advice while leaving exact send approval pending and unconsumed", async () => {
    const completed = await mountedPrrNegotiationFixture(false);
    expect(completed.mounted.result.handoff).toMatchObject({
      runType: "prr-negotiation",
      status: "ready-for-review",
      outputArtifacts: [{ artifactKind: "correspondence-draft-artifact" }]
    });
    expect(completed.mounted.authorityConsumption?.eventIds).toHaveLength(6);
    const completedWorkspace = completed.handle.mountedWorkspace;
    if (completedWorkspace === undefined) throw new Error("mounted PRR workspace is unavailable");
    const replayed = await buildSpecialistHandoffProjection({
      events: await completed.handle.ledger.readAll(),
      manifestReader: new FileBlobStore(join(
        completedWorkspace.paths.derivativeRoot,
        "specialist-handoff-manifest"
      )),
      runId: completed.dispatch.approvedRunId,
      taskId: completed.dispatch.taskId
    });
    expect(replayed).toMatchObject({
      state: "task-completed",
      diagnostics: [],
      selectedHandoff: {
        runType: "prr-negotiation",
        status: "ready-for-review"
      }
    });
    const cockpit = buildAgentCockpit({
      status: await completed.runtime.status(),
      selectedRunId: completed.dispatch.approvedRunId,
      specialistHandoffs: replayed.selectedHandoff === undefined ? [] : [replayed.selectedHandoff]
    });
    expect(cockpit.selectedRun).toMatchObject({
      runType: "prr-negotiation",
      state: "completed",
      handoff: { status: "ready-for-review" }
    });

    const waiting = await mountedPrrNegotiationFixture(true);
    expect(waiting.mounted.result.handoff).toMatchObject({
      runType: "prr-negotiation",
      status: "waiting-for-approval",
      approvalRequirements: [{ approvalClass: "external-message-send" }]
    });
    expect(waiting.mounted.authorityConsumption).toBeUndefined();
    const waitingEvents = await waiting.handle.ledger.readAll();
    expect(waitingEvents.filter((event) => event.type === "agent.tool.requested")).toHaveLength(1);
    expect(waitingEvents.find((event) => event.type === "agent.tool.requested")?.payload).toMatchObject({
      toolId: "prr.follow-up.execute",
      requiredApprovalClass: "external-message-send",
      sideEffectClass: "external-message-send"
    });
    expect(waitingEvents.map((event) => event.type)).not.toEqual(expect.arrayContaining([
      "agent.tool.executed",
      "agent.tool.completed",
      "prr.followup.sent",
      "prr.legal-escalation.confirmed",
      "agent.specialist-run.completed",
      "agent.task.orchestration.completed"
    ]));
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
    readonly runType: "timeline-builder" | "contradiction-finder" | "report-builder";
    readonly investigationId?: string;
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
        ...(input.investigationId === undefined ? {} : { investigationId: input.investigationId }),
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

async function runMountedAdvisoryResidentRequest(
  fixture: {
    readonly handle: LocalRuntimeHandle;
    readonly supervision: ResidentSupervisionRuntime;
    readonly now: () => string;
  },
  taskId: string,
  body: Readonly<Record<string, unknown>>
) {
  const response = await handleAgentHttpRoute({
    request: {
      method: "POST",
      url: `/api/agent/tasks/${taskId}/sourced-investigation`,
      body: JSON.stringify(body)
    },
    handle: fixture.handle,
    actor: { id: "actor_advisory_helper", kind: "system", label: "Advisory Helper" },
    now: fixture.now,
    supervision: fixture.supervision
  });
  if (response === undefined) throw new Error("advisory resident route was not reached");
  return response;
}

function mountedArtifactPath(root: string, contentHash: `sha256:${string}`): string {
  const digest = contentHash.slice("sha256:".length);
  return join(root, "sha256", digest.slice(0, 2), digest);
}

function createMountedSourcedCancellationController(
  fixture: { readonly workspaceRoot: string; readonly now: () => string },
  suffix: string
): {
  readonly handle: LocalRuntimeHandle;
  readonly runtime: ReturnType<typeof createAgentRuntime>;
} {
  const handle = createSqlitePrrRuntime({
    config: resolveLocalRuntimeConfig({
      cwd: fixture.workspaceRoot,
      env: {
        CESTUS_LOCAL_STORAGE: "portable-workspace",
        CESTUS_WORKSPACE_ROOT: fixture.workspaceRoot
      }
    }),
    actor: { id: `actor_sourced_cancel_${suffix}`, kind: "human", label: "Sourced Cancellation Reviewer" },
    now: fixture.now
  });
  mountedHandles.push(handle);
  return Object.freeze({
    handle,
    runtime: createAgentRuntime({
      ledger: handle.ledger,
      actor: { id: "agent_default", kind: "agent", label: "Cestus Agent" },
      now: fixture.now,
      providers: []
    })
  });
}

async function cancelMountedSourcedTask(
  fixture: {
    readonly timelineTaskId: string;
    readonly supervision: ResidentSupervisionRuntime;
    readonly now: () => string;
  },
  controller: {
    readonly handle: LocalRuntimeHandle;
    readonly runtime: ReturnType<typeof createAgentRuntime>;
  }
) {
  return await handleAgentHttpRoute({
    request: {
      method: "POST",
      url: `/api/agent/tasks/${fixture.timelineTaskId}/cancel`
    },
    handle: controller.handle,
    actor: { id: "actor_sourced_cancel", kind: "human", label: "Sourced Cancellation Reviewer" },
    now: fixture.now,
    supervision: fixture.supervision,
    agentRuntimeFactory: () => controller.runtime
  });
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
  readonly canonicalAssertionObject?: string | number | boolean | null;
  readonly secondEvidence?: "undated" | "accepted-assertion" | "conflicting-assertion";
  readonly secondEvidenceSameSourceBytes?: boolean;
  readonly secondAssertionObject?: string | number | boolean | null;
  readonly contradictionIncludesSecondEvidence?: boolean;
  readonly unrelatedTimelineIncludesFirstEvidence?: boolean;
  readonly backgroundExecution?: ResidentBackgroundExecutionPort;
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
  readonly reportTaskId: string;
  readonly reportRunId: string;
  readonly plannerTaskId: string;
  readonly plannerRunId: string;
  readonly prrTaskId: string;
  readonly prrRunId: string;
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
    allowedRunTypes: ["timeline-builder", "contradiction-finder", "investigation-planner", "prr-negotiation", "report-builder"]
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
  const advisoryPrrCreated = await handle.ledger.append({
    type: "prr.request.created",
    version: 1,
    streamId: "prr_req_sourced_factory_001",
    context: {
      actor,
      occurredAt: sourcedNow,
      causationId: linked.id,
      correlationId: "corr_prr_sourced_factory_001",
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", prr: "0.1.0" }
    },
    payload: {
      prrRequestId: "prr_req_sourced_factory_001",
      jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
      agency: { name: "Sourced Factory Records Office" },
      requester: { name: "Sourced Factory Investigator" },
      requestText: "Provide the selected source record.",
      status: "draft"
    }
  } satisfies AppendableKnowledgeEvent<"prr.request.created">);
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
        object: options.canonicalAssertionObject === undefined ? true : options.canonicalAssertionObject,
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
      options.secondEvidenceSameSourceBytes === true
        ? Buffer.from("mounted resident sourced evidence bytes", "utf8")
        : Buffer.from("mounted resident second sourced evidence bytes", "utf8")
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
    if (options.secondEvidence === "accepted-assertion" || options.secondEvidence === "conflicting-assertion") {
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
          subjectRef: options.secondEvidence === "conflicting-assertion"
            ? "subject_sourced_factory"
            : "subject_sourced_factory_second",
          predicate: "has-reviewed-record",
          object: options.secondEvidence === "conflicting-assertion"
            ? (options.secondAssertionObject === undefined ? false : options.secondAssertionObject)
            : true,
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
  const reportTaskId = "task_sourced_factory_report";
  const plannerTaskId = "task_sourced_factory_planner";
  const prrTaskId = "task_sourced_factory_prr";
  const unrelatedTimelineTaskId = secondEvidenceId === undefined
    ? undefined
    : "task_sourced_factory_unrelated_timeline";
  for (const [taskId, title] of [
    [timelineTaskId, "Build the mounted sourced timeline"],
    [contradictionTaskId, "Find mounted sourced contradictions"],
    [reportTaskId, "Assemble the mounted local report packet"],
    [plannerTaskId, "Plan the mounted investigation"],
    [prrTaskId, "Prepare mounted PRR advice"],
    ...(unrelatedTimelineTaskId === undefined
      ? []
      : [[unrelatedTimelineTaskId, "Build an unrelated mounted sourced timeline"] as const])
  ]) {
    const secondOnly = taskId === unrelatedTimelineTaskId &&
      options.unrelatedTimelineIncludesFirstEvidence !== true;
    const includeSecond = secondOnly || options.secondEvidence === "accepted-assertion" ||
      options.secondEvidence === "conflicting-assertion" ||
      (taskId === contradictionTaskId && options.contradictionIncludesSecondEvidence === true);
    const created = await setup.createTask({
      taskId,
      title,
      requestedBy: actor.id,
      priority: "normal",
      sourceEventIds: [
        ...(secondOnly ? [] : [ingested.id, linked.id, ...firstTaskSourceEventIds]),
        ...(taskId === prrTaskId ? [advisoryPrrCreated.id] : []),
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
    ...(options.backgroundExecution === undefined ? {} : { backgroundExecution: options.backgroundExecution }),
    issueMountedSourcedInvestigationHandoff: async (wakeRuntime, task) => {
      const advisory = task as unknown as {
        readonly taskId: string;
        readonly runId: string;
        readonly runType: "timeline-builder" | "contradiction-finder" | "investigation-planner" | "prr-negotiation" | "report-builder";
        readonly investigationId?: string;
      };
      return advisory.runType === "investigation-planner"
        ? await bindMountedAdvisoryHandoffForLocalAgentRuntimeFactory({
            wakeRuntime,
            taskId: advisory.taskId,
            runId: advisory.runId,
            runType: advisory.runType,
            investigationId: advisory.investigationId ?? "inv_sourced_factory_001"
          })
        : advisory.runType === "prr-negotiation"
          ? await bindMountedAdvisoryHandoffForLocalAgentRuntimeFactory({
              wakeRuntime,
              taskId: advisory.taskId,
              runId: advisory.runId,
              runType: advisory.runType
            })
          : await bindMountedSourcedInvestigationHandoffForLocalAgentRuntimeFactory({
              wakeRuntime,
              taskId: advisory.taskId,
              runId: advisory.runId,
              runType: advisory.runType,
              ...(advisory.investigationId === undefined ? {} : { investigationId: advisory.investigationId })
            });
    },
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
    reportTaskId,
    reportRunId: "run_sourced_factory_report",
    plannerTaskId,
    plannerRunId: "run_sourced_factory_planner",
    prrTaskId,
    prrRunId: "run_sourced_factory_prr",
    ...(canonicalDatedFacts === undefined ? {} : { canonicalDatedFacts }),
    ...(secondEvidenceId === undefined || secondEvidenceFacts === undefined ? {} : {
      secondEvidenceId,
      secondEvidenceFacts,
      unrelatedTimelineTaskId: unrelatedTimelineTaskId!,
      unrelatedTimelineRunId: "run_sourced_factory_unrelated_timeline"
    })
  });
}

async function mountedPrrNegotiationFixture(requestFollowUpApproval: boolean) {
  const outcome = requestFollowUpApproval ? "waiting" : "completed";
  const workspaceId = `ws_mounted_prr_${outcome}`;
  const taskId = `task_mounted_prr_${outcome}`;
  const runId = `run_mounted_prr_${outcome}`;
  const prrRequestId = `prr_req_mounted_${outcome}`;
  const correspondenceId = `corr_prr_mounted_${outcome}`;
  const workspaceRoot = mkdtempSync(join(tmpdir(), "cestus-mounted-prr-"));
  mountedTempDirs.push(workspaceRoot);
  createPortableWorkspace({
    rootDir: workspaceRoot,
    workspaceId,
    label: `Mounted PRR ${outcome} fixture`,
    createdAt: sourcedNow,
    createdBy: "actor_mounted_prr_test"
  });
  const actor = Object.freeze({ id: "agent_default" as const, kind: "agent" as const, label: "Cestus Agent" as const });
  const handle = createSqlitePrrRuntime({
    config: resolveLocalRuntimeConfig({
      cwd: workspaceRoot,
      env: { CESTUS_LOCAL_STORAGE: "portable-workspace", CESTUS_WORKSPACE_ROOT: workspaceRoot }
    }),
    actor: { id: "actor_mounted_prr_test", kind: "system", label: "Mounted PRR Test" },
    now: () => sourcedNow
  });
  mountedHandles.push(handle);
  const provider = new FakeModelProvider({
    providerId: "provider_fake_local",
    modelFamilies: ["fake-local"],
    responseText: JSON.stringify({
      draftSummary: "Review a narrow records follow-up before any external send.",
      requestFollowUpApproval,
      citedRuleRefs: ["jurisdiction-rule:us-federal-foia@0.1.0:rule_foia_deadline_001"],
      jurisdictionRefs: ["jurisdiction_us_federal_foia"],
      deadlineRefs: ["jurisdiction-rule:us-federal-foia@0.1.0:rule_foia_deadline_001"],
      deadlineNotes: ["The cited response period should be checked against the current request stream."],
      narrowingOptions: ["Limit the follow-up to the named contract and date range."],
      feeOptions: ["Ask for an itemized estimate before accepting any fee."],
      feeOrStallingSignals: ["Check for production records and agency timing before characterizing delay."],
      unresolvedQuestions: ["Has the agency acknowledged the request?"],
      legalPressureNotes: ["Any legal escalation remains a separate human-confirmed action."]
    })
  });
  const runtime = createAgentRuntime({ ledger: handle.ledger, actor, now: () => sourcedNow, providers: [provider] });
  await runtime.initializeDefaultIdentity({ workspaceId });
  const created = await runtime.createTask({
    taskId,
    title: `Prepare mounted PRR ${outcome} advice`,
    requestedBy: "actor_investigator",
    priority: "normal"
  });
  if (!created.ok) throw new Error("mounted PRR fixture task was not created");
  const sourceEvent = (await handle.ledger.readStream(`agent_task_${taskId}`)).find((event) =>
    event.type === "agent.task.created"
  );
  if (sourceEvent === undefined) throw new Error("mounted PRR source event is unavailable");

  const ports = mountedSourcedLifecyclePorts({
    workspaceId,
    workspaceIdentityEventId: `evt_mounted_prr_${outcome}_identity`,
    highWaterMark: `evt_mounted_prr_${outcome}_high_water`,
    highWaterOrdinal: 5
  });
  const wakeRuntime = {} as WakeSupervisorRuntime;
  registerMountedArtifactAuthorityIssuerForWakeRuntime({
    wakeRuntime,
    lifecyclePorts: ports,
    runtimeHandle: handle
  });
  await admitMountedSourcedAuthority(ports, workspaceId);
  const handoff = await bindMountedAdvisoryHandoffForLocalAgentRuntimeFactory({
    wakeRuntime,
    taskId,
    runId,
    runType: "prr-negotiation"
  });
  const attemptId = buildTaskAttemptId({ taskId, runType: "prr-negotiation", retryGeneration: 0 });
  const prrDispatch = Object.freeze({
    taskId,
    runType: "prr-negotiation" as const,
    attemptId,
    approvedRunId: runId
  });
  let prepared = false;
  const runner = createMountedPrrNegotiationSpecialistRunner({
    resolve: async () => {
      if (prepared) throw new Error("mounted PRR fixture is one-shot");
      prepared = true;
      await appendMountedAttemptBinding(handle.ledger, {
        taskId,
        runId,
        attemptId,
        actor,
        runType: "prr-negotiation"
      });
      const started = await runtime.startRun({
        runId,
        taskId,
        runType: "prr-negotiation",
        scope: { kind: "workspace", refs: [workspaceId] }
      });
      if (!started.ok) throw new Error("mounted PRR run did not start");
      const contextPacks = mountedPrrNegotiationContextPacks({
        prrRequestId,
        taskId,
        runId,
        workspaceId,
        sourceEventId: sourceEvent.id
      });
      const scope = Object.freeze({
        kind: "prr-request" as const,
        refs: Object.freeze([prrRequestId]),
        associatedPrrRequestId: prrRequestId
      });
      const registration = productionSpecialistPromptRegistrationFor("prr-negotiation");
      const resolvedContextPacks = await Promise.all(registration.contextRequirements.map(async (requirement) =>
        await contextPacks.buildResolved(requirement.contextPackId)
      ));
      const rendered = renderProductionSpecialistPrompt({
        taskId,
        runId,
        runType: "prr-negotiation",
        generatedAt: sourcedNow,
        scope,
        resolvedContextPacks,
        omissions: []
      });
      const promptStore = await createMountedPromptArtifactStore({ handle });
      await promptStore.put(rendered);
      const promptReadback = await promptStore.read({
        inputArtifactHash: rendered.manifest.inputArtifactHash as `sha256:${string}`,
        authoritativeResolvedContextPacks: rendered.resolvedContextPacks
      });
      if (promptReadback.witness === undefined) {
        throw new Error("mounted PRR prompt readback witness is unavailable");
      }
      return Object.freeze({
        ledger: handle.ledger,
        actor,
        now: () => sourcedNow,
        contextPacks,
        scope,
        runtime,
        providerReadiness: mountedPrrProviderReadiness(),
        providerId: "provider_fake_local",
        modelFamily: "fake-local",
        credentialRef: {
          credentialRefId: "agent_credref_fake_local",
          providerId: "provider_fake_local",
          kind: "local-no-secret" as const
        },
        mountedPromptReadbackWitness: promptReadback.witness,
        prrRequestId,
        correspondenceId,
        jurisdictionRuleRefs: ["jurisdiction-rule:us-federal-foia@0.1.0:rule_foia_deadline_001"],
        followUpApprovalPreview: mountedPrrFollowUpApprovalPreview({
          prrRequestId,
          correspondenceId,
          sourceEventId: sourceEvent.id
        })
      });
    }
  });
  const mounted = await runner.dispatch({
    dispatch: prrDispatch,
    retryGeneration: 0,
    handoff
  });
  return Object.freeze({ handle, runtime, dispatch: prrDispatch, handoff, mounted });
}

function mountedPrrNegotiationContextPacks(input: {
  readonly prrRequestId: string;
  readonly taskId: string;
  readonly runId: string;
  readonly workspaceId: string;
  readonly sourceEventId: string;
}) {
  const registry = createContextPackRegistry();
  const contextPackIds = [
    "prr-read-model.v1",
    "jurisdiction-pack-summary.v1",
    "governance-locks.v1",
    "evidence-summary.v1",
    "agent-memory-summary.v1",
    "task-run-history.v1",
    "workspace-runtime-status.v1"
  ] as const;
  for (const contextPackId of contextPackIds) {
    registry.register({
      descriptor: {
        contextPackId,
        version: 1,
        label: `${contextPackId} mounted PRR summary`,
        maxBytes: 16_384,
        requiredProvenanceKinds: ["event"],
        redactionPolicy: "safe-summary-only",
        sourceProjection: "mounted-prr-test-projection"
      },
      parsePayload: mountedPrrContextPackParser(contextPackId),
      build: () => ({
        contextPackId,
        version: 1,
        generatedAt: sourcedNow,
        payload: mountedPrrContextPayload(contextPackId, input),
        safeSummary: contextPackId === "governance-locks.v1"
          ? "Governance posture is clear for local advisory drafting."
          : `${contextPackId} is current for local PRR advice.`,
        provenanceRefs: [`event:${input.sourceEventId}`],
        sourceEventIds: [input.sourceEventId],
        ...(contextPackId === "prr-read-model.v1"
          ? { scope: { kind: "prr-request", id: input.prrRequestId } }
          : {}),
        sizeBudgetBytes: 16_384
      })
    });
  }
  return registry;
}

function mountedPrrContextPackParser(contextPackId: string) {
  const parser = (payload: AgentContextPackJsonValue, ref?: { readonly contextPackId: string }) => {
    if (ref?.contextPackId !== contextPackId || typeof payload !== "object" || payload === null || Array.isArray(payload)) {
      throw new Error("invalid mounted PRR context pack payload");
    }
    return payload;
  };
  Object.defineProperty(parser, "cestusContextPackParserId", {
    value: contextPackId,
    enumerable: false,
    configurable: false,
    writable: false
  });
  registerContextPackPayloadParserAuthority(parser);
  return parser;
}

function mountedPrrContextPayload(
  contextPackId: string,
  input: {
    readonly prrRequestId: string;
    readonly taskId: string;
    readonly runId: string;
    readonly workspaceId: string;
    readonly sourceEventId: string;
  }
): AgentContextPackJsonValue {
  switch (contextPackId) {
    case "prr-read-model.v1":
      return {
        schemaVersion: "prr-read-model-context.v1",
        scope: { kind: "prr-request", id: input.prrRequestId },
        lifecycle: {
          status: "sent",
          agencyName: "Example Records Office",
          jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" }
        },
        requestStream: {
          requestCreatedEventId: input.sourceEventId,
          streamHeadEventId: input.sourceEventId,
          streamHighWaterMark: 1,
          sourceEventIds: [input.sourceEventId]
        },
        deadline: {
          deadlineDate: "2026-08-24",
          source: "confirmed",
          confirmedBy: "actor_records_officer",
          citedRules: [{
            label: "FOIA response deadline",
            citation: "5 USC 552(a)(6)(A)",
            jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" }
          }]
        },
        fee: null,
        narrowing: null,
        correspondence: { outbound: [], inbound: [] },
        production: {
          batches: [],
          evidenceIds: [],
          exemptions: [],
          denial: null,
          appeal: null,
          stalling: { possible: false, confirmed: false, signals: [] },
          escalation: null
        },
        diagnostics: [],
        gates: [],
        sourceRefs: { correspondence: [], evidence: [] },
        omissions: []
      };
    case "jurisdiction-pack-summary.v1":
      return {
        schemaVersion: "jurisdiction-pack-summary-context.v1",
        packName: "us-federal-foia",
        packVersion: "0.1.0",
        jurisdiction: "US federal",
        jurisdictionRefs: ["jurisdiction_us_federal_foia"],
        citedRules: [{
          id: "rule_foia_deadline_001",
          ruleRef: "jurisdiction-rule:us-federal-foia@0.1.0:rule_foia_deadline_001",
          kind: "deadline",
          label: "FOIA response deadline",
          citation: "5 USC 552(a)(6)(A)"
        }],
        advisoryPosture: { summary: "Advisory only; legal action remains human-controlled." },
        omissions: []
      };
    case "governance-locks.v1":
      return { items: { activeLocks: [], governanceRestrictions: [] } };
    case "evidence-summary.v1":
      return { items: [] };
    case "agent-memory-summary.v1":
      return {
        memory: {
          activeMemory: [],
          aggregateCounts: { active: 0 },
          sourceEventIds: [input.sourceEventId],
          artifactHashes: []
        }
      };
    case "task-run-history.v1":
      return {
        history: {
          projectionHighWaterMark: 1,
          projectionSourceRef: "agent.projection.task-run-history",
          tasks: [{ taskId: input.taskId, status: "running", statusReasonCode: "prr-negotiation" }],
          runs: [{
            runId: input.runId,
            state: "running",
            runType: "prr-negotiation",
            taskId: input.taskId,
            sourceEventIds: [input.sourceEventId]
          }],
          modelInvocations: [],
          toolRequests: [],
          aggregateCounts: { tasks: 1, runs: 1 },
          sourceEventIds: [input.sourceEventId],
          artifactHashes: [],
          window: { order: "created-at", limit: 2, hasMore: false, totalCount: 2, omissionCodes: [] }
        }
      };
    case "workspace-runtime-status.v1":
      return {
        runtime: {
          runtimeHighWaterMark: 1,
          workspaceMounted: true,
          workspaceId: input.workspaceId,
          storageStrategy: "portable-workspace",
          bindPosture: "bound",
          authPosture: "ready",
          providerStates: [{ providerId: "provider_fake_local", state: "works-locally", reasonCode: "local-only" }],
          diagnostics: [],
          projectionHighWaterMarks: { agent: 1 },
          omissionCodes: []
        }
      };
    default:
      throw new Error("unsupported mounted PRR context pack");
  }
}

function mountedPrrProviderReadiness(): ProviderReadinessDto {
  return {
    schemaVersion: "agent-provider-readiness.v1",
    generatedAt: sourcedNow,
    cards: [{
      providerId: "provider_fake_local",
      label: "Fake Local Model Provider",
      backendKind: "local-engine",
      capabilitySummary: ["text"],
      credentialKindSummary: ["local-no-secret"],
      state: "works-locally",
      requiredApprovalClass: "none",
      credentialHealth: "not-required",
      dataHandlingPosture: "local-only",
      safeActionIds: ["action_use_local_provider"]
    }],
    diagnostics: []
  };
}

function mountedPrrFollowUpApprovalPreview(input: {
  readonly prrRequestId: string;
  readonly correspondenceId: string;
  readonly sourceEventId: string;
}): PrrNegotiationFollowUpApprovalPreviewInput {
  const subject = "Public records request follow-up";
  const body = "Please confirm the status of the records request.";
  return {
    provider: "gmail",
    messageSourceEventId: input.sourceEventId,
    message: {
      from: "investigator@example.org",
      to: ["foia@example.gov"],
      cc: [],
      subject,
      subjectHash: hashBytes(Buffer.from(subject, "utf8")),
      bodyHash: hashBytes(Buffer.from(body, "utf8")),
      renderedBodyHash: hashBytes(Buffer.from(body, "utf8")),
      attachments: [],
      requiresLegalConfirmation: false,
      providerIdempotencyKey: `followup_${input.prrRequestId}_${input.correspondenceId}`
    },
    requestState: {
      requestCreatedEventId: input.sourceEventId,
      status: "sent",
      jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
      confirmedStalling: false,
      initialSentEventId: input.sourceEventId
    },
    providerCapability: {
      provider: "gmail",
      canSend: true,
      canSync: true,
      canFetchAttachments: true,
      capabilityRef: hashBytes(Buffer.from("mounted Gmail capability", "utf8"))
    },
    legalGateChecks: [{
      id: "legal-confirmation-not-required",
      ready: true,
      locked: false,
      detail: "Routine correspondence does not require legal escalation confirmation."
    }],
    legalEvidenceBindings: [],
    lockSnapshot: [],
    projectionHighWaterMark: 1
  };
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
    readonly runType?: "timeline-builder" | "prr-negotiation";
  }
): Promise<void> {
  const runType = input.runType ?? "timeline-builder";
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
