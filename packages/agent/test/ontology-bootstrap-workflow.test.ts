import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildOntologyBootstrapAgentReviewBundle,
  buildOntologyBootstrapDossierContextPack,
  hashOntologyBootstrapReviewBundle,
  runOntologyBootstrapResidentWorkflow as runOntologyBootstrapResidentWorkflowKernel,
  toAgentOntologyBootstrapToolPreview
} from "../src/ontology-bootstrap-workflow.js";
import type { RunOntologyBootstrapResidentWorkflowInput } from "../src/ontology-bootstrap-workflow.js";
import { validateOntologyBootstrapNousMemo } from "../src/ontology-bootstrap-nous.js";
import {
  issueMountedSpecialistHandoffAuthorityWitness,
  type MountedSpecialistHandoffAuthorityWitness
} from "../src/specialist-handoff-authority.js";
import {
  bootstrapEvidenceLinksFixture,
  bootstrapReportFixture,
  bootstrapReviewFixture
} from "../../ontology-bootstrap/test/fixtures/bootstrap-fixtures.js";
import { runFakeOntologyBootstrapSpecialist } from "../../ontology-bootstrap/src/fake-runtime.js";
import {
  buildLegacyMigrationReport,
  legacyReportStreamId,
  readCanonicalStagedLegacyReport,
  reportArtifactJson,
  type LegacyMigrationReport
} from "../../ingestion/src/legacy-report.js";
import { InMemoryEventLedger, type EventLedger } from "../../ontology/src/event-ledger.js";
import { buildAgentProjection } from "../src/projection.js";
import { createAgentRuntime } from "../src/runtime.js";

const now = () => "2026-07-08T14:00:00.000Z";
const humanActor = { id: "actor_case_owner", kind: "human" as const, label: "Case Owner" };
const agentActor = { id: "actor_cestus_agent", kind: "agent" as const, label: "Cestus Agent" };
const canonicalBootstrapReportFixture = buildLegacyMigrationReport({
  sourceCollectionId: bootstrapReportFixture.sourceCollectionId,
  scanBatchId: bootstrapReportFixture.scanBatchId,
  files: bootstrapReportFixture.files,
  detections: bootstrapReportFixture.detections,
  proposedAssertionCandidates: bootstrapReportFixture.proposedAssertionCandidates,
  quarantineEntries: bootstrapReportFixture.quarantineEntries
}) satisfies LegacyMigrationReport;
const authorityHash = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;

describe("ontology bootstrap resident-agent review bundle", () => {
  it("builds a stable review bundle from an evidence-tied bootstrap dossier", () => {
    const bootstrap = runFakeOntologyBootstrapSpecialist({
      sourceCollectionId: "src_old_cestus",
      report: bootstrapReportFixture,
      review: bootstrapReviewFixture,
      evidenceLinks: bootstrapEvidenceLinksFixture,
      selectedCandidateIds: ["legacy_candidate_001"],
      now
    });
    expect(bootstrap.ok).toBe(true);
    if (!bootstrap.ok) return;

    const bundle = buildOntologyBootstrapAgentReviewBundle({
      runId: "run_ontology_bootstrap_001",
      taskId: "task_ontology_bootstrap_001",
      generatedAt: now(),
      dossier: bootstrap.dossier,
      toolPreviews: bootstrap.toolPreviews
    });

    expect(bundle.schemaVersion).toBe("agent-ontology-bootstrap-review.v1");
    expect(bundle.dossier.legacyReportId).toBe("legacy_report_001");
    expect(bundle.stagingReview.selectedCandidateIds).toEqual(["legacy_candidate_001"]);
    expect(bundle.candidateBundles[0]).toMatchObject({
      bundleId: "bootstrap_bundle_src_old_cestus_scan_old_cestus_001_0001",
      chunkId: "bootstrap_chunk_src_old_cestus_scan_old_cestus_001_0001",
      eligibleCount: 1,
      blockedCount: 1
    });
    expect(bundle.candidateBundles[0]?.candidates[0]).toMatchObject({
      candidateId: "legacy_candidate_001",
      status: "eligible",
      proposedAssertion: {
        predicate: "agency.name",
        object: "Example Agency",
        reviewState: "proposed-material"
      },
      evidenceRefs: [{
        evidenceId: "ev_legacy_claims",
        evidenceContentHash: expect.stringMatching(/^sha256:/),
        sourceCollectionId: "src_old_cestus"
      }],
      sourceArtifactHashes: expect.arrayContaining([
        bootstrapReportFixture.reportHash,
        bootstrapReportFixture.candidateSetHash
      ]),
      rationale: expect.stringContaining("parser"),
      alternatives: expect.any(Array),
      uncertainty: expect.any(String),
      blockedReasons: []
    });
    expect(hashOntologyBootstrapReviewBundle(bundle)).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(hashOntologyBootstrapReviewBundle(buildOntologyBootstrapAgentReviewBundle({
      runId: "run_ontology_bootstrap_001",
      taskId: "task_ontology_bootstrap_001",
      generatedAt: now(),
      dossier: bootstrap.dossier,
      toolPreviews: bootstrap.toolPreviews
    }))).toBe(hashOntologyBootstrapReviewBundle(bundle));
    expect(JSON.stringify(bundle)).not.toMatch(/assertion\.accepted|entity\.resolved|relationship\.accepted/i);
  });

  it("chunks candidate bundles with stable cursors for high-volume review", () => {
    const baseCandidate = bootstrapReportFixture.proposedAssertionCandidates[0];
    expect(baseCandidate).toBeDefined();
    if (baseCandidate === undefined) return;

    const report: LegacyMigrationReport = {
      ...bootstrapReportFixture,
      proposedAssertionCandidates: [
        ...bootstrapReportFixture.proposedAssertionCandidates,
        {
          ...baseCandidate,
          candidateId: "legacy_candidate_002",
          observationId: "legacy_observation_002",
          object: "Example Agency Alternative"
        }
      ]
    };
    const bootstrap = runFakeOntologyBootstrapSpecialist({
      sourceCollectionId: "src_old_cestus",
      report,
      review: bootstrapReviewFixture,
      evidenceLinks: bootstrapEvidenceLinksFixture,
      selectedCandidateIds: ["legacy_candidate_001", "legacy_candidate_002"],
      now
    });
    expect(bootstrap.ok).toBe(true);
    if (!bootstrap.ok) return;

    const bundle = buildOntologyBootstrapAgentReviewBundle({
      runId: "run_ontology_bootstrap_001",
      taskId: "task_ontology_bootstrap_001",
      generatedAt: now(),
      dossier: bootstrap.dossier,
      toolPreviews: bootstrap.toolPreviews,
      maxCandidatesPerBundle: 1
    });

    expect(bundle.candidateBundles).toHaveLength(3);
    expect(bundle.candidateBundles.map((candidateBundle) => candidateBundle.cursor.currentOffset)).toEqual([0, 1, 2]);
    expect(bundle.candidateBundles[0]?.cursor.nextOffset).toBe(1);
    expect(bundle.candidateBundles[2]?.cursor.nextOffset).toBeUndefined();
    expect(new Set(bundle.candidateBundles.map((candidateBundle) => candidateBundle.bundleHash)).size).toBe(3);
  });

  it("creates a context pack ref bound to report, candidate set, and dossier hashes", () => {
    const bootstrap = runFakeOntologyBootstrapSpecialist({
      sourceCollectionId: "src_old_cestus",
      report: bootstrapReportFixture,
      review: bootstrapReviewFixture,
      evidenceLinks: bootstrapEvidenceLinksFixture,
      selectedCandidateIds: ["legacy_candidate_001"],
      now
    });
    expect(bootstrap.ok).toBe(true);
    if (!bootstrap.ok) return;

    const contextPack = buildOntologyBootstrapDossierContextPack({
      generatedAt: now(),
      dossier: bootstrap.dossier,
      reviewBundleHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111"
    });

    expect(contextPack.contextPackId).toBe("ontology-bootstrap-dossier.v1");
    expect(contextPack.provenanceRefs).toEqual(expect.arrayContaining([
      bootstrap.dossier.reportHash,
      bootstrap.dossier.candidateSetHash
    ]));
    expect(contextPack.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("maps ontology-bootstrap tool previews to agent-safe preview objects", () => {
    const bootstrap = runFakeOntologyBootstrapSpecialist({
      sourceCollectionId: "src_old_cestus",
      report: bootstrapReportFixture,
      review: bootstrapReviewFixture,
      evidenceLinks: bootstrapEvidenceLinksFixture,
      selectedCandidateIds: ["legacy_candidate_001"],
      now
    });
    expect(bootstrap.ok).toBe(true);
    if (!bootstrap.ok) return;

    const toolPreview = bootstrap.toolPreviews[0];
    expect(toolPreview).toBeDefined();
    if (toolPreview === undefined) return;

    const preview = toAgentOntologyBootstrapToolPreview(toolPreview);

    expect(preview.summary).toContain("ontology staging approval");
    expect(preview.bootstrapPreviewHash).toMatch(/^sha256:/);
    expect(preview.affectedRefs).toEqual(expect.arrayContaining([
      { kind: "legacy-report", id: "legacy_report_001", hash: bootstrapReportFixture.reportHash },
      { kind: "candidate-set", id: "legacy_report_001", hash: bootstrapReportFixture.candidateSetHash },
      { kind: "legacy-candidate", id: "legacy_candidate_001" }
    ]));
    expect(JSON.stringify(preview)).not.toMatch(/api key|authorization|bearer|password|secret/i);
  });

  it("rejects invalid agent IDs and unsafe staging previews", () => {
    const bootstrap = runFakeOntologyBootstrapSpecialist({
      sourceCollectionId: "src_old_cestus",
      report: bootstrapReportFixture,
      review: bootstrapReviewFixture,
      evidenceLinks: bootstrapEvidenceLinksFixture,
      selectedCandidateIds: ["legacy_candidate_001"],
      now
    });
    expect(bootstrap.ok).toBe(true);
    if (!bootstrap.ok) return;

    expect(() => buildOntologyBootstrapAgentReviewBundle({
      runId: "task_ontology_bootstrap_001",
      generatedAt: now(),
      dossier: bootstrap.dossier,
      toolPreviews: bootstrap.toolPreviews
    })).toThrow();

    const toolPreview = bootstrap.toolPreviews[0];
    expect(toolPreview).toBeDefined();
    if (toolPreview === undefined) return;

    expect(() => toAgentOntologyBootstrapToolPreview({
      ...toolPreview,
      evidenceRefs: []
    })).toThrow(/Evidence ref is required/);

    expect(() => toAgentOntologyBootstrapToolPreview({
      ...toolPreview,
      allowedEventTypes: ["assertion.accepted"]
    })).toThrow();
  });
});

describe("runOntologyBootstrapResidentWorkflow", () => {
  it("fails closed before bootstrap material effects when mounted handoff authority is unavailable", async () => {
    const ledger = new InMemoryEventLedger();
    const runtime = createAgentRuntime({ ledger, actor: humanActor, now });
    await runtime.initializeDefaultIdentity({ workspaceId: "ws_case_001" });
    await runtime.createTask({
      taskId: "task_ontology_bootstrap_001",
      title: "Bootstrap old Cestus archive",
      requestedBy: humanActor.id,
      priority: "normal"
    });
    const canonical = await startCanonicalWorkflowRun(ledger, runtime);
    const before = (await ledger.readAll()).length;

    const result = await runOntologyBootstrapResidentWorkflow({
      ledger,
      actor: agentActor,
      residentAgentId: "agent_default",
      runId: "run_ontology_bootstrap_001",
      taskId: "task_ontology_bootstrap_001",
      sourceCollectionId: canonical.report.sourceCollectionId,
      stagedReport: canonicalStagedReportIdentity(canonical.report),
      reportEventId: canonical.reportEventId,
      derivativeStore: canonical.derivativeStore,
      handoffAuthorityWitness: undefined,
      review: {
        ...bootstrapReviewFixture,
        latestReportId: canonical.report.legacyReportId,
        ontologyStagingApproved: true
      },
      evidenceLinks: bootstrapEvidenceLinksFixture,
      selectedCandidateIds: ["legacy_candidate_001"],
      now
    } as never);

    expect(result).toMatchObject({ ok: false, category: "provenance-missing" });
    expect((await ledger.readAll()).slice(before).map((event) => event.type)).toEqual([
      "agent.specialist-run.failed"
    ]);
  });

  it("rejects a structurally forged mounted authority before workflow events or material writes", async () => {
    const ledger = new InMemoryEventLedger();
    const runtime = createAgentRuntime({ ledger, actor: humanActor, now });
    await runtime.initializeDefaultIdentity({ workspaceId: "ws_case_001" });
    await runtime.createTask({
      taskId: "task_ontology_bootstrap_001",
      title: "Bootstrap old Cestus archive",
      requestedBy: humanActor.id,
      priority: "normal"
    });
    const canonical = await startCanonicalWorkflowRun(ledger, runtime);
    let materialWrites = 0;
    const noEffectStore: RunOntologyBootstrapResidentWorkflowInput["derivativeStore"] = Object.freeze({
      put: async (bytes) => {
        materialWrites += 1;
        return await canonical.derivativeStore.put(bytes);
      },
      get: async (contentHash) => await canonical.derivativeStore.get(contentHash)
    });
    const input = {
      ledger,
      actor: agentActor,
      residentAgentId: "agent_default",
      runId: "run_ontology_bootstrap_001",
      taskId: "task_ontology_bootstrap_001",
      sourceCollectionId: canonical.report.sourceCollectionId,
      stagedReport: canonicalStagedReportIdentity(canonical.report),
      reportEventId: canonical.reportEventId,
      derivativeStore: noEffectStore,
      handoffMaterialStore: noEffectStore,
      handoffManifestStore: noEffectStore,
      review: {
        ...bootstrapReviewFixture,
        latestReportId: canonical.report.legacyReportId,
        ontologyStagingApproved: true
      },
      evidenceLinks: bootstrapEvidenceLinksFixture,
      selectedCandidateIds: ["legacy_candidate_001"],
      now
    } satisfies RunOntologyBootstrapResidentWorkflowInput;
    expect(Reflect.defineProperty(input, "handoffAuthorityWitness", {
      value: Object.freeze({ schemaVersion: "agent-mounted-specialist-handoff-authority.v1" }),
      enumerable: true
    })).toBe(true);
    const before = await ledger.readAll();

    const result = await runOntologyBootstrapResidentWorkflowKernel(input);

    expect(result).toMatchObject({ ok: false, category: "provenance-missing", eventIds: [] });
    expect(await ledger.readAll()).toEqual(before);
    expect(materialWrites).toBe(0);
  });

  it("revalidates a factory-issued authority before pending approval workflow effects", async () => {
    const ledger = new InMemoryEventLedger();
    const runtime = createAgentRuntime({ ledger, actor: humanActor, now });
    await runtime.initializeDefaultIdentity({ workspaceId: "ws_case_001" });
    await runtime.createTask({
      taskId: "task_ontology_bootstrap_001",
      title: "Bootstrap old Cestus archive",
      requestedBy: humanActor.id,
      priority: "normal"
    });
    const canonical = await startCanonicalWorkflowRun(ledger, runtime);
    const highWaterEventId = (await ledger.readAll()).at(-1)?.id;
    expect(highWaterEventId).toBeDefined();
    if (highWaterEventId === undefined) return;
    const staleAuthority = issueMountedSpecialistHandoffAuthorityWitness({
      authorityBinding: {
        workspaceIdentityHash: authorityHash,
        mountGeneration: "mount_generation_ontology_bootstrap_001",
        ledgerStoreIdentity: "ledger_store_ontology_bootstrap_001",
        artifactStoreIdentity: "artifact_store_ontology_bootstrap_001",
        ledgerHighWaterEventId: highWaterEventId,
        policyHash: authorityHash,
        activeLocksHash: authorityHash
      },
      taskLifecycle: {
        taskId: "task_ontology_bootstrap_001",
        attemptId: `attempt_${createHash("sha256").update("task_ontology_bootstrap_001:run_ontology_bootstrap_001:ontology-bootstrap").digest("hex")}`,
        runId: "run_ontology_bootstrap_001",
        runType: "ontology-bootstrap",
        retryGeneration: 0
      },
      revalidateCurrent: async () => {
        throw new Error("stale mounted authority");
      }
    });
    const before = await ledger.readAll();

    const result = await runOntologyBootstrapResidentWorkflowKernel({
      ledger,
      actor: agentActor,
      residentAgentId: "agent_default",
      runId: "run_ontology_bootstrap_001",
      taskId: "task_ontology_bootstrap_001",
      sourceCollectionId: canonical.report.sourceCollectionId,
      stagedReport: canonicalStagedReportIdentity(canonical.report),
      reportEventId: canonical.reportEventId,
      derivativeStore: canonical.derivativeStore,
      handoffMaterialStore: canonical.derivativeStore,
      handoffManifestStore: canonical.derivativeStore,
      handoffAuthorityWitness: staleAuthority,
      review: { ...bootstrapReviewFixture, latestReportId: canonical.report.legacyReportId },
      evidenceLinks: bootstrapEvidenceLinksFixture,
      selectedCandidateIds: ["legacy_candidate_001"],
      now
    });

    expect(result).toMatchObject({ ok: false, category: "provenance-missing", eventIds: [] });
    expect(await ledger.readAll()).toEqual(before);
  });

  it("fails closed before effects when the canonical reader identity is omitted", async () => {
    const ledger = new InMemoryEventLedger();
    const runtime = createAgentRuntime({ ledger, actor: humanActor, now });
    await runtime.initializeDefaultIdentity({ workspaceId: "ws_case_001" });
    await runtime.createTask({
      taskId: "task_ontology_bootstrap_001",
      title: "Bootstrap old Cestus archive",
      requestedBy: humanActor.id,
      priority: "normal"
    });
    await runtime.startRun({
      runId: "run_ontology_bootstrap_001",
      taskId: "task_ontology_bootstrap_001",
      runType: "ontology-bootstrap",
      scope: { kind: "workspace", refs: ["ws_case_001"] }
    });
    const before = (await ledger.readAll()).length;

    const result = await runOntologyBootstrapResidentWorkflow({
      ledger,
      actor: agentActor,
      residentAgentId: "agent_default",
      runId: "run_ontology_bootstrap_001",
      taskId: "task_ontology_bootstrap_001",
      sourceCollectionId: "src_old_cestus",
      report: bootstrapReportFixture,
      review: bootstrapReviewFixture,
      evidenceLinks: bootstrapEvidenceLinksFixture,
      selectedCandidateIds: ["legacy_candidate_001"],
      now
    } as never);

    expect(result).toMatchObject({ ok: false, category: "provenance-missing" });
    expect((await ledger.readAll()).slice(before).map((event) => event.type)).toEqual([
      "agent.specialist-run.failed"
    ]);
  });

  it("fails closed before effects when the run omits the exact canonical report event and hash", async () => {
    const ledger = new InMemoryEventLedger();
    const runtime = createAgentRuntime({ ledger, actor: humanActor, now });
    await runtime.initializeDefaultIdentity({ workspaceId: "ws_case_001" });
    await runtime.createTask({
      taskId: "task_ontology_bootstrap_001",
      title: "Bootstrap old Cestus archive",
      requestedBy: humanActor.id,
      priority: "normal"
    });
    const canonical = await canonicalBootstrapInput(ledger);
    await runtime.startRun({
      runId: "run_ontology_bootstrap_001",
      taskId: "task_ontology_bootstrap_001",
      runType: "ontology-bootstrap",
      scope: { kind: "workspace", refs: ["ws_case_001"] },
      sourceEventIds: ["evt_other_report"],
      inputArtifactHashes: [canonical.report.candidateSetHash]
    });
    const before = (await ledger.readAll()).length;

    const result = await runOntologyBootstrapResidentWorkflow({
      ledger,
      actor: agentActor,
      residentAgentId: "agent_default",
      runId: "run_ontology_bootstrap_001",
      taskId: "task_ontology_bootstrap_001",
      sourceCollectionId: canonical.report.sourceCollectionId,
      stagedReport: canonicalStagedReportIdentity(canonical.report),
      reportEventId: canonical.reportEventId,
      derivativeStore: canonical.derivativeStore,
      review: {
        ...bootstrapReviewFixture,
        latestReportId: canonical.report.legacyReportId,
        ontologyStagingApproved: true
      },
      evidenceLinks: bootstrapEvidenceLinksFixture,
      selectedCandidateIds: ["legacy_candidate_001"],
      now
    } as never);

    expect(result).toMatchObject({ ok: false, category: "provenance-missing" });
    expect((await ledger.readAll()).slice(before).map((event) => event.type)).toEqual([
      "agent.specialist-run.failed"
    ]);
  });

  it("fails closed before effects when a run includes extra canonical-looking provenance", async () => {
    const ledger = new InMemoryEventLedger();
    const runtime = createAgentRuntime({ ledger, actor: humanActor, now });
    await runtime.initializeDefaultIdentity({ workspaceId: "ws_case_001" });
    await runtime.createTask({
      taskId: "task_ontology_bootstrap_001",
      title: "Bootstrap old Cestus archive",
      requestedBy: humanActor.id,
      priority: "normal"
    });
    const canonical = await canonicalBootstrapInput(ledger);
    await runtime.startRun({
      runId: "run_ontology_bootstrap_001",
      taskId: "task_ontology_bootstrap_001",
      runType: "ontology-bootstrap",
      scope: { kind: "workspace", refs: ["ws_case_001"] },
      sourceEventIds: [canonical.reportEventId, "evt_unrelated_report"],
      inputArtifactHashes: [
        canonical.report.reportHash,
        canonical.report.candidateSetHash,
        "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
      ]
    });
    const before = (await ledger.readAll()).length;

    const result = await runOntologyBootstrapResidentWorkflow({
      ledger,
      actor: agentActor,
      residentAgentId: "agent_default",
      runId: "run_ontology_bootstrap_001",
      taskId: "task_ontology_bootstrap_001",
      sourceCollectionId: canonical.report.sourceCollectionId,
      stagedReport: canonicalStagedReportIdentity(canonical.report),
      reportEventId: canonical.reportEventId,
      derivativeStore: canonical.derivativeStore,
      review: { ...bootstrapReviewFixture, latestReportId: canonical.report.legacyReportId },
      evidenceLinks: bootstrapEvidenceLinksFixture,
      selectedCandidateIds: ["legacy_candidate_001"],
      now
    } as never);

    expect(result).toMatchObject({ ok: false, category: "provenance-missing" });
    expect((await ledger.readAll()).slice(before).map((event) => event.type)).toEqual([
      "agent.specialist-run.failed"
    ]);
  });

  it("fails when terminal lifecycle readback has a mismatched correlation", async () => {
    const backing = new InMemoryEventLedger();
    const ledger = terminalCorrelationFaultLedger(backing);
    const runtime = createAgentRuntime({ ledger, actor: humanActor, now });
    await runtime.initializeDefaultIdentity({ workspaceId: "ws_case_001" });
    await runtime.createTask({
      taskId: "task_ontology_bootstrap_001",
      title: "Bootstrap old Cestus archive",
      requestedBy: humanActor.id,
      priority: "normal"
    });
    const canonical = await canonicalBootstrapInput(ledger);
    await runtime.startRun({
      runId: "run_ontology_bootstrap_001",
      taskId: "task_ontology_bootstrap_001",
      runType: "ontology-bootstrap",
      scope: { kind: "workspace", refs: ["ws_case_001"] },
      sourceEventIds: [canonical.reportEventId],
      inputArtifactHashes: [canonical.report.reportHash, canonical.report.candidateSetHash]
    });

    const result = await runOntologyBootstrapResidentWorkflow({
      ledger,
      actor: agentActor,
      residentAgentId: "agent_default",
      runId: "run_ontology_bootstrap_001",
      taskId: "task_ontology_bootstrap_001",
      sourceCollectionId: canonical.report.sourceCollectionId,
      stagedReport: canonicalStagedReportIdentity(canonical.report),
      reportEventId: canonical.reportEventId,
      derivativeStore: canonical.derivativeStore,
      review: {
        ...bootstrapReviewFixture,
        latestReportId: canonical.report.legacyReportId,
        ontologyStagingApproved: true
      },
      evidenceLinks: bootstrapEvidenceLinksFixture,
      selectedCandidateIds: ["legacy_candidate_001"],
      now
    } as never);

    expect(result).toMatchObject({ ok: false, category: "external-effect-failed" });
    expect((await backing.readAll()).map((event) => event.type)).toContain("agent.specialist-run.failed");
  });

  it("fails closed before bootstrap effects for a forged canonical report-event binding", async () => {
    const ledger = new InMemoryEventLedger();
    const runtime = createAgentRuntime({ ledger, actor: humanActor, now });
    await runtime.initializeDefaultIdentity({ workspaceId: "ws_case_001" });
    await runtime.createTask({
      taskId: "task_ontology_bootstrap_001",
      title: "Bootstrap old Cestus archive",
      requestedBy: humanActor.id,
      priority: "normal"
    });
    const canonical = await canonicalBootstrapInput(ledger);
    const reader = await readCanonicalStagedLegacyReport({
      ledger,
      derivativeStore: canonical.derivativeStore,
      reportEventId: canonical.reportEventId,
      sourceCollectionId: canonical.report.sourceCollectionId,
      scanBatchId: canonical.report.scanBatchId,
      legacyReportId: canonical.report.legacyReportId,
      reportHash: canonical.report.reportHash
    });
    if (!reader.ok) throw new Error(reader.code);
    await runtime.startRun({
      runId: "run_ontology_bootstrap_001",
      taskId: "task_ontology_bootstrap_001",
      runType: "ontology-bootstrap",
      scope: { kind: "workspace", refs: ["ws_case_001"] },
      sourceEventIds: [canonical.reportEventId],
      inputArtifactHashes: [canonical.report.reportHash, canonical.report.candidateSetHash]
    });
    const before = (await ledger.readAll()).length;

    const result = await runOntologyBootstrapResidentWorkflow({
      ledger,
      actor: agentActor,
      residentAgentId: "agent_default",
      runId: "run_ontology_bootstrap_001",
      taskId: "task_ontology_bootstrap_001",
      sourceCollectionId: "src_old_cestus",
      stagedReport: canonicalStagedReportIdentity(canonical.report),
      review: { ...bootstrapReviewFixture, latestReportId: canonical.report.legacyReportId },
      evidenceLinks: bootstrapEvidenceLinksFixture,
      selectedCandidateIds: ["legacy_candidate_001"],
      reportEventId: "evt_forged_report_binding",
      derivativeStore: canonical.derivativeStore,
      now
    } as never);

    expect(result).toMatchObject({ ok: false, category: "provenance-missing" });
    const workflowEvents = (await ledger.readAll()).slice(before);
    expect(workflowEvents.map((event) => event.type)).toEqual(["agent.specialist-run.failed"]);
  });

  it("binds the exact final-output to prepared, recorded, and terminal lifecycle chain", async () => {
    const ledger = new InMemoryEventLedger();
    const runtime = createAgentRuntime({ ledger, actor: humanActor, now });
    await runtime.initializeDefaultIdentity({ workspaceId: "ws_case_001" });
    await runtime.createTask({
      taskId: "task_ontology_bootstrap_001",
      title: "Bootstrap old Cestus archive",
      requestedBy: humanActor.id,
      priority: "normal"
    });
    const canonical = await canonicalBootstrapInput(ledger);
    await runtime.startRun({
      runId: "run_ontology_bootstrap_001",
      taskId: "task_ontology_bootstrap_001",
      runType: "ontology-bootstrap",
      scope: { kind: "workspace", refs: ["ws_case_001"] },
      sourceEventIds: [canonical.reportEventId],
      inputArtifactHashes: [canonical.report.reportHash, canonical.report.candidateSetHash]
    });

    const result = await runOntologyBootstrapResidentWorkflow({
      ledger,
      actor: agentActor,
      residentAgentId: "agent_default",
      runId: "run_ontology_bootstrap_001",
      taskId: "task_ontology_bootstrap_001",
      sourceCollectionId: "src_old_cestus",
      stagedReport: canonicalStagedReportIdentity(canonical.report),
      review: {
        ...bootstrapReviewFixture,
        latestReportId: canonical.report.legacyReportId,
        ontologyStagingApproved: true
      },
      evidenceLinks: bootstrapEvidenceLinksFixture,
      selectedCandidateIds: ["legacy_candidate_001"],
      reportEventId: canonical.reportEventId,
      derivativeStore: canonical.derivativeStore,
      now
    } as never);

    if (!result.ok) throw new Error(result.message);
    expect(result).toMatchObject({ ok: true });
    const events = await ledger.readAll();
    const chain = events.filter((event) => [
      "agent.specialist-run.step.recorded",
      "agent.specialist-handoff.prepared",
      "agent.specialist-handoff.recorded",
      "agent.specialist-run.completed"
    ].includes(event.type));
    expect(chain.map((event) => event.type)).toEqual(expect.arrayContaining([
      "agent.specialist-run.step.recorded",
      "agent.specialist-handoff.prepared",
      "agent.specialist-handoff.recorded",
      "agent.specialist-run.completed"
    ]));
    const finalOutput = events.find((event) =>
      event.type === "agent.specialist-run.step.recorded" && event.payload.stepKind === "final-output"
    );
    const prepared = events.find((event) => event.type === "agent.specialist-handoff.prepared");
    const recorded = events.find((event) => event.type === "agent.specialist-handoff.recorded");
    const terminal = events.find((event) => event.type === "agent.specialist-run.completed");
    expect(finalOutput).toBeDefined();
    expect(prepared).toBeDefined();
    expect(recorded).toBeDefined();
    expect(terminal).toBeDefined();
    if (finalOutput === undefined || prepared === undefined || recorded === undefined || terminal === undefined) return;
    expect([finalOutput, prepared, recorded, terminal].map((event) => event.context.actor.id)).toEqual([
      agentActor.id,
      agentActor.id,
      agentActor.id,
      agentActor.id
    ]);
    expect(finalOutput.context.correlationId).toBe("corr_run_ontology_bootstrap_001_final_output");
    expect(prepared.context.correlationId).toBe("corr_run_ontology_bootstrap_001_handoff_prepared");
    expect(recorded.context.correlationId).toBe("corr_run_ontology_bootstrap_001_handoff_recorded");
    expect(terminal.context.correlationId).toBe("corr_run_ontology_bootstrap_001_completed");
    expect(prepared.context.causationId).toBe(finalOutput.id);
    expect(recorded.context.causationId).toBe(prepared.id);
    expect(terminal.context.causationId).toBe(recorded.id);
    expect(finalOutput.sequence).toBeLessThan(prepared.sequence);
    expect(prepared.sequence).toBeLessThan(recorded.sequence);
    expect(recorded.sequence).toBeLessThan(terminal.sequence);
  });

  it("records dossier review steps and pauses on human staging approval request", async () => {
    const ledger = new InMemoryEventLedger();
    const runtime = createAgentRuntime({ ledger, actor: humanActor, now });
    await runtime.initializeDefaultIdentity({ workspaceId: "ws_case_001" });
    await runtime.createTask({
      taskId: "task_ontology_bootstrap_001",
      title: "Bootstrap old Cestus archive",
      requestedBy: humanActor.id,
      priority: "normal"
    });
    const canonical = await startCanonicalWorkflowRun(ledger, runtime);

    const result = await runOntologyBootstrapResidentWorkflow({
      ledger,
      actor: agentActor,
      residentAgentId: "agent_default",
      runId: "run_ontology_bootstrap_001",
      taskId: "task_ontology_bootstrap_001",
      sourceCollectionId: canonical.report.sourceCollectionId,
      stagedReport: canonicalStagedReportIdentity(canonical.report),
      reportEventId: canonical.reportEventId,
      derivativeStore: canonical.derivativeStore,
      review: { ...bootstrapReviewFixture, latestReportId: canonical.report.legacyReportId },
      evidenceLinks: bootstrapEvidenceLinksFixture,
      selectedCandidateIds: ["legacy_candidate_001"],
      maxCandidatesPerBundle: 50,
      now
    });

    const projection = buildAgentProjection(await ledger.readAll());
    expect(result.ok).toBe(true);
    expect(projection.runs.get("run_ontology_bootstrap_001")?.stepIds).toContain("step_ontology_bootstrap_dossier");
    expect(projection.toolRequests.get("toolreq_ontology_bootstrap_staging_approval")?.requiredApprovalClass).toBe("ledger-review");
    const events = await ledger.readAll();
    expect(projection.tasks.get("task_ontology_bootstrap_001")?.status).toBe("waiting-for-approval");
    expect(result.ok && result.handoffEventIds).toEqual([]);
    expect(events.filter((event) =>
      (event.type === "agent.specialist-run.step.recorded" && event.payload.stepKind === "final-output") ||
      [
        "agent.specialist-handoff.prepared",
        "agent.specialist-handoff.recorded",
        "agent.specialist-run.completed",
        "agent.task.orchestration.completed"
      ].includes(event.type)
    )).toEqual([]);
    expect(events.map((event) => event.type)).not.toContain("assertion.proposed");
    expect(events.map((event) => event.type)).not.toContain("assertion.accepted");
  });

  it("records a model-invocation-linked step when a Nous memo artifact is supplied", async () => {
    const ledger = new InMemoryEventLedger();
    const runtime = createAgentRuntime({ ledger, actor: humanActor, now });
    await runtime.initializeDefaultIdentity({ workspaceId: "ws_case_001" });
    await runtime.createTask({
      taskId: "task_ontology_bootstrap_001",
      title: "Bootstrap old Cestus archive",
      requestedBy: humanActor.id,
      priority: "normal"
    });
    const canonical = await startCanonicalWorkflowRun(ledger, runtime);

    const memo = validateOntologyBootstrapNousMemo(
      "Review note: prioritize eligible agency name candidates and inspect the malformed quarantine group."
    );
    const result = await runOntologyBootstrapResidentWorkflow({
      ledger,
      actor: agentActor,
      residentAgentId: "agent_default",
      runId: "run_ontology_bootstrap_001",
      taskId: "task_ontology_bootstrap_001",
      sourceCollectionId: canonical.report.sourceCollectionId,
      stagedReport: canonicalStagedReportIdentity(canonical.report),
      reportEventId: canonical.reportEventId,
      derivativeStore: canonical.derivativeStore,
      review: { ...bootstrapReviewFixture, latestReportId: canonical.report.legacyReportId },
      evidenceLinks: bootstrapEvidenceLinksFixture,
      selectedCandidateIds: ["legacy_candidate_001"],
      nousMemo: {
        invocationId: "inv_ontology_bootstrap_nous",
        outputArtifactHash: "sha256:3434343434343434343434343434343434343434343434343434343434343434",
        memo
      },
      now
    });

    const projection = buildAgentProjection(await ledger.readAll());
    expect(result.ok).toBe(true);
    expect(result.ok ? result.nousMemoHash : undefined).toBe(memo.memoHash);
    expect(projection.runs.get("run_ontology_bootstrap_001")?.stepIds).toContain("step_ontology_bootstrap_nous_review");
    expect(projection.runs.get("run_ontology_bootstrap_001")?.invocationIds).toContain("inv_ontology_bootstrap_nous");
    expect(JSON.stringify(await ledger.readAll())).not.toMatch(/assertion\.accepted|entity\.resolved|relationship\.accepted/i);
  });

  it("reuses the durable terminal handoff when replay runs at a later time", async () => {
    const ledger = new InMemoryEventLedger();
    let currentNow = "2026-07-08T14:00:00.000Z";
    const replayNow = () => currentNow;
    const runtime = createAgentRuntime({ ledger, actor: humanActor, now: replayNow });
    await runtime.initializeDefaultIdentity({ workspaceId: "ws_case_001" });
    await runtime.createTask({
      taskId: "task_ontology_bootstrap_001",
      title: "Bootstrap old Cestus archive",
      requestedBy: humanActor.id,
      priority: "normal"
    });
    const canonical = await startCanonicalWorkflowRun(ledger, runtime);

    const input = {
      ledger,
      actor: agentActor,
      residentAgentId: "agent_default",
      runId: "run_ontology_bootstrap_001",
      taskId: "task_ontology_bootstrap_001",
      sourceCollectionId: canonical.report.sourceCollectionId,
      stagedReport: canonicalStagedReportIdentity(canonical.report),
      reportEventId: canonical.reportEventId,
      derivativeStore: canonical.derivativeStore,
      review: {
        ...bootstrapReviewFixture,
        latestReportId: canonical.report.legacyReportId,
        ontologyStagingApproved: true
      },
      evidenceLinks: bootstrapEvidenceLinksFixture,
      selectedCandidateIds: ["legacy_candidate_001"],
      maxCandidatesPerBundle: 1,
      now: replayNow
    };

    const first = await runOntologyBootstrapResidentWorkflow(input);
    currentNow = "2026-07-08T14:05:00.000Z";
    const second = await runOntologyBootstrapResidentWorkflow(input);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    const toolRequestedEvents = (await ledger.readAll()).filter((event) => event.type === "agent.tool.requested");
    expect(toolRequestedEvents).toHaveLength(0);
    expect(first.ok && second.ok ? second.reviewBundleHash : undefined).toBe(
      first.ok && second.ok ? first.reviewBundleHash : undefined
    );
    expect((await ledger.readAll()).filter((event) => event.type === "agent.specialist-handoff.recorded")).toHaveLength(1);
    expect((await ledger.readAll()).filter((event) => event.type === "agent.specialist-run.completed")).toHaveLength(1);
  });

  it("fails closed when a pending bootstrap approval preview changes on resume", async () => {
    const ledger = new InMemoryEventLedger();
    const runtime = createAgentRuntime({ ledger, actor: humanActor, now });
    await runtime.initializeDefaultIdentity({ workspaceId: "ws_case_001" });
    await runtime.createTask({
      taskId: "task_ontology_bootstrap_001",
      title: "Bootstrap old Cestus archive",
      requestedBy: humanActor.id,
      priority: "normal"
    });
    const canonical = await startCanonicalWorkflowRun(ledger, runtime);

    const input = {
      ledger,
      actor: agentActor,
      residentAgentId: "agent_default",
      runId: "run_ontology_bootstrap_001",
      taskId: "task_ontology_bootstrap_001",
      sourceCollectionId: canonical.report.sourceCollectionId,
      stagedReport: canonicalStagedReportIdentity(canonical.report),
      reportEventId: canonical.reportEventId,
      derivativeStore: canonical.derivativeStore,
      review: { ...bootstrapReviewFixture, latestReportId: canonical.report.legacyReportId },
      evidenceLinks: bootstrapEvidenceLinksFixture,
      selectedCandidateIds: ["legacy_candidate_001"],
      now
    };

    const first = await runOntologyBootstrapResidentWorkflow(input);
    const stale = await runOntologyBootstrapResidentWorkflow({
      ...input,
      stagingBatchId: "legacy_stage_changed_preview"
    });

    const projection = buildAgentProjection(await ledger.readAll());
    const toolRequestedEvents = (await ledger.readAll()).filter((event) => event.type === "agent.tool.requested");
    expect(first.ok).toBe(true);
    expect(stale.ok).toBe(false);
    expect(stale.ok ? undefined : stale.category).toBe("approval-stale");
    expect(projection.runs.get("run_ontology_bootstrap_001")?.failureCategory).toBe("approval-stale");
    expect(toolRequestedEvents).toHaveLength(1);
  });

  it("fails safely without appending tool requests when the report is missing", async () => {
    const ledger = new InMemoryEventLedger();
    const runtime = createAgentRuntime({ ledger, actor: humanActor, now });
    await runtime.initializeDefaultIdentity({ workspaceId: "ws_case_001" });
    await runtime.startRun({
      runId: "run_ontology_bootstrap_missing",
      runType: "ontology-bootstrap",
      scope: { kind: "workspace", refs: ["ws_case_001"] }
    });

    const result = await runOntologyBootstrapResidentWorkflow({
      ledger,
      actor: agentActor,
      residentAgentId: "agent_default",
      runId: "run_ontology_bootstrap_missing",
      sourceCollectionId: "src_old_cestus",
      review: {
        sourceCollectionId: "src_old_cestus",
        rawImportRequiresApproval: false,
        ontologyStagingApproved: false,
        firstArtifactAsk: ["Read-only folder tree listing of the old Cestus root"],
        diagnostics: []
      },
      evidenceLinks: [],
      selectedCandidateIds: [],
      now
    } as never);

    const projection = buildAgentProjection(await ledger.readAll());
    expect(result.ok).toBe(false);
    expect(projection.runs.get("run_ontology_bootstrap_missing")?.state).toBe("failed");
    expect(projection.runs.get("run_ontology_bootstrap_missing")?.failureCategory).toBe("provenance-missing");
    expect(projection.toolRequests.size).toBe(0);
  });
});

async function canonicalBootstrapInput(ledger: EventLedger): Promise<{
  readonly report: LegacyMigrationReport;
  readonly reportEventId: string;
  readonly derivativeStore: {
    readonly get: (contentHash: `sha256:${string}`) => Promise<Buffer>;
    readonly put: (content: Buffer) => Promise<{ readonly contentHash: `sha256:${string}`; readonly sizeBytes: number }>;
  };
}> {
  const artifacts = new Map<string, Buffer>();
  const derivativeStore = Object.freeze({
    async get(contentHash: `sha256:${string}`): Promise<Buffer> {
      const artifact = artifacts.get(contentHash);
      if (artifact === undefined) throw new Error("Missing canonical test artifact.");
      return Buffer.from(artifact);
    },
    async put(content: Buffer): Promise<{ readonly contentHash: `sha256:${string}`; readonly sizeBytes: number }> {
      const contentHash = `sha256:${createHash("sha256").update(content).digest("hex")}` as const;
      artifacts.set(contentHash, Buffer.from(content));
      return Object.freeze({ contentHash, sizeBytes: content.length });
    }
  });
  const storedReport = await derivativeStore.put(Buffer.from(reportArtifactJson(canonicalBootstrapReportFixture), "utf8"));
  if (storedReport.contentHash !== canonicalBootstrapReportFixture.reportHash) {
    throw new Error(`Canonical test report hash mismatch: ${storedReport.contentHash} != ${canonicalBootstrapReportFixture.reportHash}`);
  }
  const reportEvent = await ledger.append({
    type: "legacy.import.report.generated",
    version: 1,
    streamId: legacyReportStreamId(canonicalBootstrapReportFixture),
    context: {
      actor: humanActor,
      occurredAt: now(),
      correlationId: "corr_legacy_report_001",
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", ingestion: "0.1.0", legacy: "0.1.0" }
    },
    payload: {
      legacyReportId: canonicalBootstrapReportFixture.legacyReportId,
      sourceCollectionId: canonicalBootstrapReportFixture.sourceCollectionId,
      scanBatchId: canonicalBootstrapReportFixture.scanBatchId,
      reportHash: canonicalBootstrapReportFixture.reportHash,
      candidateSetHash: canonicalBootstrapReportFixture.candidateSetHash,
      generatedAt: canonicalBootstrapReportFixture.generatedAt,
      generator: canonicalBootstrapReportFixture.generator,
      totals: canonicalBootstrapReportFixture.totals
    }
  });
  return Object.freeze({
    report: canonicalBootstrapReportFixture,
    reportEventId: reportEvent.id,
    derivativeStore
  });
}

function canonicalStagedReportIdentity(report: LegacyMigrationReport) {
  return Object.freeze({
    sourceCollectionId: report.sourceCollectionId,
    scanBatchId: report.scanBatchId,
    legacyReportId: report.legacyReportId,
    reportHash: report.reportHash
  });
}

async function startCanonicalWorkflowRun(
  ledger: EventLedger,
  runtime: Pick<ReturnType<typeof createAgentRuntime>, "startRun">
) {
  const canonical = await canonicalBootstrapInput(ledger);
  await runtime.startRun({
    runId: "run_ontology_bootstrap_001",
    taskId: "task_ontology_bootstrap_001",
    runType: "ontology-bootstrap",
    scope: { kind: "workspace", refs: ["ws_case_001"] },
    sourceEventIds: [canonical.reportEventId],
    inputArtifactHashes: [canonical.report.reportHash, canonical.report.candidateSetHash]
  });
  return canonical;
}

type BootstrapWorkflowInput = RunOntologyBootstrapResidentWorkflowInput & {
  readonly handoffAuthorityWitness?: MountedSpecialistHandoffAuthorityWitness | undefined;
};

async function runOntologyBootstrapResidentWorkflow(input: BootstrapWorkflowInput) {
  const handoffAuthorityWitness = Object.prototype.hasOwnProperty.call(input, "handoffAuthorityWitness")
    ? input.handoffAuthorityWitness
    : await mountedBootstrapHandoffAuthorityWitness(input);
  return await runOntologyBootstrapResidentWorkflowKernel({
    ...input,
    ...(input.derivativeStore === undefined ? {} : {
      handoffMaterialStore: input.handoffMaterialStore ?? input.derivativeStore,
      handoffManifestStore: input.handoffManifestStore ?? input.derivativeStore
    }),
    handoffAuthorityWitness
  });
}

async function mountedBootstrapHandoffAuthorityWitness(
  input: RunOntologyBootstrapResidentWorkflowInput
): Promise<MountedSpecialistHandoffAuthorityWitness | undefined> {
  if (input.taskId === undefined) return undefined;
  const highWaterEventId = (await input.ledger.readAll()).at(-1)?.id;
  if (highWaterEventId === undefined) return undefined;
  return issueMountedSpecialistHandoffAuthorityWitness({
    authorityBinding: {
      workspaceIdentityHash: authorityHash,
      mountGeneration: "mount_generation_ontology_bootstrap_001",
      ledgerStoreIdentity: "ledger_store_ontology_bootstrap_001",
      artifactStoreIdentity: "artifact_store_ontology_bootstrap_001",
      ledgerHighWaterEventId: highWaterEventId,
      policyHash: authorityHash,
      activeLocksHash: authorityHash
    },
    taskLifecycle: {
      taskId: input.taskId,
      attemptId: `attempt_${createHash("sha256").update(`${input.taskId}:${input.runId}:ontology-bootstrap`).digest("hex")}`,
      runId: input.runId,
      runType: "ontology-bootstrap",
      retryGeneration: 0
    },
    revalidateCurrent: async () => undefined
  });
}

function terminalCorrelationFaultLedger(delegate: EventLedger): EventLedger {
  return {
    append: async (event, options) => await delegate.append(event, options),
    readAll: async () => await delegate.readAll(),
    readStream: async (streamId) => (await delegate.readStream(streamId)).map((event) =>
      event.type === "agent.specialist-run.completed"
        ? {
            ...event,
            context: {
              ...event.context,
              correlationId: "corr_forged_terminal"
            }
          }
        : event
    )
  };
}
