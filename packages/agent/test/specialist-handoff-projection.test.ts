import { describe, expect, it } from "vitest";
import type { KnowledgeEvent, KnowledgeEventOf } from "../../ontology/src/contracts.js";
import {
  buildSpecialistHandoffManifest,
  buildSpecialistHandoffMaterial,
  canonicalSpecialistHandoffJson,
  canonicalSpecialistHandoffMaterialBytes,
  computeSpecialistHandoffId,
  hashSpecialistHandoffManifest,
  hashSpecialistHandoffMaterial,
  type SpecialistHandoffMaterial,
  type BuildSpecialistHandoffManifestInput,
  type SpecialistHandoffManifest
} from "../src/specialist-handoff-manifest.js";
import {
  buildSpecialistHandoffProjection,
  type SpecialistHandoffManifestReader,
  type SpecialistHandoffProjectionState
} from "../src/specialist-handoff-projection.js";
import type { SpecialistWorkflowHandoffDto } from "../src/specialist-handoffs.js";

const hash111 = "sha256:1111111111111111111111111111111111111111111111111111111111111111";
const hash222 = "sha256:2222222222222222222222222222222222222222222222222222222222222222";
const hash333 = "sha256:3333333333333333333333333333333333333333333333333333333333333333";
const hash444 = "sha256:4444444444444444444444444444444444444444444444444444444444444444";
const hash555 = "sha256:5555555555555555555555555555555555555555555555555555555555555555";

describe("specialist handoff projection", () => {
  it("projects no-output when no exact final-output step exists", async () => {
    const fixture = handoffFixture();

    const projection = await project([startedEvent(fixture)], new ManifestMap());

    expect(projection.state).toBe("no-output");
    expect(projection.handoffs).toEqual([]);
    expect(projection.selectedHandoff).toBeUndefined();
    expect(projection.diagnostics).toEqual([]);
  });

  it("ignores arbitrary specialist steps as handoff output", async () => {
    const fixture = handoffFixture();
    const arbitraryStep = specialistStepEvent(fixture, {
      id: "evt_audit_step",
      stepId: "step_run_handoff_001_audit",
      payload: {
        summary: "Ordinary audit step with output hashes is not final output.",
        outputArtifactHashes: [hash222]
      }
    });

    const projection = await project([startedEvent(fixture), arbitraryStep], new ManifestMap());

    expect(projection.state).toBe("no-output");
    expect(projection.handoffs).toEqual([]);
    expect(projection.history).toEqual([]);
  });

  it("projects output-persisted after exact final-output step only", async () => {
    const fixture = handoffFixture();

    const projection = await project(
      [startedEvent(fixture), finalOutputStepEvent(fixture)],
      new ManifestMap().putFixture(fixture)
    );

    expect(projection.state).toBe("output-persisted");
    expect(projection.handoffs).toEqual([]);
    expect(projection.selectedHandoff).toBeUndefined();
    expect(projection.history).toContainEqual(expect.objectContaining({
      state: "output-persisted",
      runId: fixture.runId,
      finalOutputEventId: fixture.finalOutputEventId
    }));
  });

  it("projects ontology-bootstrap through the canonical lifecycle and fails closed on mismatched, cross-run, missing-artifact, or missing-provenance output", async () => {
    const fixture = handoffFixture({
      runId: "run_ontology_bootstrap_handoff_001",
      taskId: "task_ontology_bootstrap_handoff_001",
      runType: "ontology-bootstrap"
    });
    const terminal = completedRunEvent(fixture, { causationId: fixture.recordedEventId });
    const projection = await project([
      ...validRecordedEvents(fixture),
      terminal,
      taskStatusEvent(fixture, "completed", { causationId: terminal.id })
    ], materializedStore(fixture));
    expect(projection.state).toBe("task-completed");
    expect(projection.selectedHandoff).toEqual(expect.objectContaining({
      runId: fixture.runId,
      taskId: fixture.taskId,
      runType: "ontology-bootstrap"
    }));

    const mismatchedSchema = {
      ...finalOutputStepEvent(fixture),
      payload: { ...finalOutputStepEvent(fixture).payload, stepSchemaId: "evidence-triage-handoff.v1" }
    } as KnowledgeEvent;
    await expectInconsistent(
      [startedEvent(fixture), mismatchedSchema, preparedEvent(fixture), recordedEvent(fixture)],
      materializedStore(fixture),
      "final-output-mismatch"
    );

    const crossRun = {
      ...finalOutputStepEvent(fixture),
      payload: { ...finalOutputStepEvent(fixture).payload, runId: "run_ontology_bootstrap_cross_run_001" }
    } as KnowledgeEvent;
    await expectInconsistent(
      [startedEvent(fixture), crossRun, preparedEvent(fixture), recordedEvent(fixture)],
      materializedStore(fixture),
      "final-output-mismatch"
    );

    await expectInconsistent(
      validRecordedEvents(fixture),
      new ManifestMap().put(fixture.manifestHash, canonicalSpecialistHandoffJson(fixture.manifest)),
      "handoff-material-missing"
    );

    const missingProvenance = handoffFixture({
      runId: "run_ontology_bootstrap_missing_provenance_001",
      taskId: "task_ontology_bootstrap_missing_provenance_001",
      runType: "ontology-bootstrap",
      contextPackRefs: [contextPackRef(hash444, "evt_missing_bootstrap_provenance")]
    });
    await expectInconsistent(
      validRecordedEvents(missingProvenance),
      materializedStore(missingProvenance),
      "final-output-mismatch"
    );
  });

  it("fails closed when output-persisted material is missing or schema authority is forged", async () => {
    const fixture = handoffFixture();
    await expectInconsistent(
      [startedEvent(fixture), finalOutputStepEvent(fixture)],
      new ManifestMap(),
      "handoff-material-missing"
    );

    const forgedSchema = {
      ...finalOutputStepEvent(fixture),
      payload: {
        ...finalOutputStepEvent(fixture).payload,
        stepSchemaId: "caller-forged-final-output.v1"
      }
    } as KnowledgeEvent;
    await expectInconsistent(
      [startedEvent(fixture), forgedSchema],
      new ManifestMap().putFixture(fixture),
      "final-output-mismatch"
    );

    const forgedIdempotency = {
      ...finalOutputStepEvent(fixture),
      payload: {
        ...finalOutputStepEvent(fixture).payload,
        idempotencyKey: "specialist-final-output:forged"
      }
    } as KnowledgeEvent;
    await expectInconsistent(
      [startedEvent(fixture), forgedIdempotency],
      new ManifestMap().putFixture(fixture),
      "idempotency-key-mismatch"
    );
  });

  it("fails closed on conflicting final-output events for the same run task and type", async () => {
    const fixture = handoffFixture();
    const conflictingFinalOutput = specialistStepEvent(fixture, {
      id: "evt_final_output_conflicting",
      stepId: "step_run_handoff_001_second_final_output",
      payload: {
        summary: "Conflicting final durable output artifacts were persisted.",
        stepKind: "final-output",
        stepSchemaId: "evidence-triage-handoff.v1",
        idempotencyKey: "specialist-final-output:run_handoff_001:task_handoff_001:evidence-triage:ready-for-review:conflict",
        handoffMaterialArtifactHash: fixture.materialHash,
        outputArtifactHashes: [hash333]
      }
    });

    const projection = await project([
      ...validRecordedEvents(fixture),
      conflictingFinalOutput
    ], new ManifestMap().putFixture(fixture));

    expect(projection.state).toBe("inconsistent");
    expect(projection.diagnostics).toContainEqual(expect.objectContaining({
      code: "conflicting-final-output"
    }));
  });

  it("fails closed when final-output material binding or idempotency changes with the same output hashes", async () => {
    const fixture = handoffFixture();
    const ambiguousFinalOutput = {
      ...finalOutputStepEvent(fixture),
      id: "evt_final_output_ambiguous_material",
      payload: {
        ...finalOutputStepEvent(fixture).payload,
        idempotencyKey: "specialist-final-output:run_handoff_001:task_handoff_001:evidence-triage:ready-for-review:ambiguous",
        handoffMaterialArtifactHash: hash555
      }
    } as KnowledgeEvent;

    await expectInconsistent(
      [...validRecordedEvents(fixture), ambiguousFinalOutput],
      new ManifestMap().putFixture(fixture),
      "conflicting-final-output"
    );
  });

  it("rejects replayed handoffs whose final-output schema does not match production authority", async () => {
    const fixture = handoffFixture();
    const forgedSchema = {
      ...finalOutputStepEvent(fixture),
      payload: {
        ...finalOutputStepEvent(fixture).payload,
        stepSchemaId: "caller-forged-final-output.v1"
      }
    } as KnowledgeEvent;

    await expectInconsistent(
      [startedEvent(fixture), forgedSchema, preparedEvent(fixture), recordedEvent(fixture)],
      new ManifestMap().putFixture(fixture),
      "final-output-mismatch"
    );
  });

  it("rejects replayed handoffs without exactly one ledger-bound run identity", async () => {
    const fixture = handoffFixture();
    const withoutStarted = validRecordedEvents(fixture).filter((event) => event.type !== "agent.specialist-run.started");
    await expectInconsistent(withoutStarted, new ManifestMap().putFixture(fixture), "run-identity-mismatch");

    const duplicateStarted = {
      ...startedEvent(fixture),
      id: "evt_started_duplicate_run_handoff_001",
      payload: { ...startedEvent(fixture).payload, runType: "investigation-planner" }
    } as KnowledgeEvent;
    await expectInconsistent(
      [startedEvent(fixture), duplicateStarted, finalOutputStepEvent(fixture), preparedEvent(fixture), recordedEvent(fixture)],
      new ManifestMap().putFixture(fixture),
      "run-identity-mismatch"
    );
  });

  it("rejects nested tool refs that are absent from the top-level same-run tool request set", async () => {
    const nestedTool = "toolreq_nested_projection";
    const fixture = handoffFixture({
      approvalRequirements: [{
        approvalClass: "human-review",
        reason: "Nested review tool is required.",
        toolRequestId: nestedTool
      }],
      nextSafeActions: [{
        actionId: "action_nested_tool",
        label: "Review nested tool request",
        kind: "review",
        effect: "request-approval",
        toolRequestId: nestedTool
      }]
    });

    await expectInconsistent(
      validRecordedEvents(fixture),
      new ManifestMap().putFixture(fixture),
      "tool-request-mismatch"
    );

    const failed = handoffFixture({
      runId: "run_nested_failure_tool_001",
      taskId: "task_nested_failure_tool_001",
      status: "failed",
      failure: {
        category: "model-output-invalid",
        code: "model-output-invalid",
        safeSummary: "Nested failed tool request was not ledger-bound.",
        retryable: true,
        toolRequestId: "toolreq_nested_failure"
      }
    });
    await expectInconsistent(
      validRecordedEvents(failed),
      new ManifestMap().putFixture(failed),
      "tool-request-mismatch"
    );
  });

  it("projects handoff-pending after prepared when manifest is bound but not recorded", async () => {
    const fixture = handoffFixture();
    const manifests = new ManifestMap().putFixture(fixture);

    const projection = await project([
      startedEvent(fixture),
      finalOutputStepEvent(fixture),
      preparedEvent(fixture)
    ], manifests);

    expect(projection.state).toBe("handoff-pending");
    expect(projection.handoffs).toEqual([]);
    expect(projection.selectedHandoff).toBeUndefined();
    expect(projection.history).toContainEqual(expect.objectContaining({
      state: "handoff-pending",
      handoffId: fixture.manifest.handoffId,
      preparedEventId: fixture.preparedEventId
    }));
  });

  it("fails closed instead of pending when prepared manifest readback is unsafe", async () => {
    const missing = handoffFixture({ runId: "run_prepared_missing_manifest" });
    await expectInconsistent([
      startedEvent(missing),
      finalOutputStepEvent(missing),
      preparedEvent(missing)
    ], new ManifestMap(), "manifest-missing");

    const malformed = handoffFixture({ runId: "run_prepared_malformed_manifest" });
    await expectInconsistent([
      startedEvent(malformed),
      finalOutputStepEvent(malformed),
      preparedEvent(malformed)
    ], new ManifestMap().put(malformed.manifestHash, Buffer.from("{not json", "utf8")), "manifest-malformed");

    const missingOutput = handoffFixture({ runId: "run_prepared_missing_final_output" });
    await expectInconsistent([
      startedEvent(missingOutput),
      preparedEvent(missingOutput)
    ], new ManifestMap().putFixture(missingOutput), "final-output-mismatch");

    const wrongCausation = handoffFixture({ runId: "run_prepared_wrong_causation" });
    await expectInconsistent([
      startedEvent(wrongCausation),
      finalOutputStepEvent(wrongCausation),
      preparedEvent(wrongCausation, "evt_unrelated_final_output")
    ], new ManifestMap().putFixture(wrongCausation), "handoff-causation-mismatch");
  });

  it("fails closed on nondeterministic handoff idempotency keys", async () => {
    const fixture = handoffFixture({
      preparedPayloadOverride: { idempotencyKey: "not-deterministic" },
      recordedPayloadOverride: { idempotencyKey: "not-deterministic" }
    });

    await expectInconsistent(
      validRecordedEvents(fixture),
      new ManifestMap().putFixture(fixture),
      "idempotency-key-mismatch"
    );
  });

  it("projects handoff-recorded only after manifest readback verifies", async () => {
    const fixture = handoffFixture();
    const manifests = new ManifestMap().putFixture(fixture);

    const projection = await project(validRecordedEvents(fixture), manifests);

    expect(projection.state, JSON.stringify(projection.diagnostics)).toBe("handoff-recorded");
    expect(projection.selectedHandoff).toEqual(fixture.manifest.handoff);
    expect(projection.handoffs).toEqual([fixture.manifest.handoff]);
    expect(projection.history).toContainEqual(expect.objectContaining({
      state: "handoff-recorded",
      handoffId: fixture.manifest.handoffId,
      recordedEventId: fixture.recordedEventId
    }));

    const withoutTask = handoffFixture({ runId: "run_without_task_001", taskId: null });
    const taskScopedProjection = await project(
      validRecordedEvents(withoutTask),
      new ManifestMap().putFixture(withoutTask),
      { runId: withoutTask.runId, taskId: "task_handoff_001" }
    );
    expect(taskScopedProjection.state).toBe("no-output");
    expect(taskScopedProjection.handoffs).toEqual([]);
  });

  it("rejects missing, swapped, stale, or byte-mismatched ledger-bound handoff material", async () => {
    const fixture = handoffFixture();
    const wrong = handoffFixture({ runId: "run_wrong_material_001", safeSummary: "Different swapped material." });
    const base = new ManifestMap().put(fixture.manifestHash, canonicalSpecialistHandoffJson(fixture.manifest));

    await expectInconsistent(validRecordedEvents(fixture), base, "handoff-material-missing");
    await expectInconsistent(
      validRecordedEvents(fixture),
      new ManifestMap()
        .putFixture(fixture)
        .put(fixture.materialHash, canonicalSpecialistHandoffMaterialBytes(wrong.material)),
      "handoff-material-hash-mismatch"
    );
    await expectInconsistent(
      validRecordedEvents(fixtureWithPreparedOverride({ handoffMaterialArtifactHash: hash555 })),
      materializedStore(fixture),
      "handoff-material-missing"
    );
    await expectInconsistent(
      validRecordedEvents(fixture),
      new ManifestMap()
        .putFixture(fixture)
        .put(fixture.materialHash, Buffer.from("{}", "utf8")),
      "handoff-material-hash-mismatch"
    );
  });

  it("rejects material output hashes that differ from the final-output event", async () => {
    const fixture = handoffFixture();
    const mismatched = {
      ...finalOutputStepEvent(fixture),
      payload: { ...finalOutputStepEvent(fixture).payload, outputArtifactHashes: [hash333] }
    } as KnowledgeEvent;

    await expectInconsistent(
      [startedEvent(fixture), mismatched, preparedEvent(fixture), recordedEvent(fixture)],
      materializedStore(fixture),
      "final-output-mismatch"
    );
  });

  it("dedupes exact recorded retries and fails closed on changed recorded timestamps", async () => {
    const fixture = handoffFixture();
    const exactRetry = {
      ...recordedEvent(fixture),
      id: "evt_handoff_recorded_exact_retry"
    } as KnowledgeEvent;
    const exactRetryProjection = await project([
      ...validRecordedEvents(fixture),
      exactRetry
    ], new ManifestMap().putFixture(fixture));

    expect(exactRetryProjection.state).toBe("handoff-recorded");
    expect(exactRetryProjection.handoffs).toEqual([fixture.manifest.handoff]);

    const changedTimestamp = {
      ...recordedEvent(fixture),
      id: "evt_handoff_recorded_changed_timestamp",
      payload: {
        ...recordedEvent(fixture).payload,
        verifiedAt: "2026-07-10T15:02:00.000Z"
      }
    } as KnowledgeEvent;
    const conflictingRetryProjection = await project([
      ...validRecordedEvents(fixture),
      changedTimestamp,
      completedRunEvent(fixture, { causationId: "evt_handoff_recorded_changed_timestamp" }),
      taskStatusEvent(fixture, "completed", { causationId: "evt_run_completed" })
    ], new ManifestMap().putFixture(fixture));

    expect(conflictingRetryProjection.state).toBe("inconsistent");
    expect(conflictingRetryProjection.diagnostics).toContainEqual(expect.objectContaining({
      code: "conflicting-recorded"
    }));
  });

  it("accepts an unscoped multi-run ledger without cross-run final-output conflicts", async () => {
    const first = handoffFixture({
      runId: "run_handoff_multi_001",
      taskId: "task_handoff_multi_001",
      finalOutputEventId: "evt_final_output_multi_001"
    });
    const second = handoffFixture({
      runId: "run_handoff_multi_002",
      taskId: "task_handoff_multi_002",
      finalOutputEventId: "evt_final_output_multi_002"
    });
    const firstCorrection = handoffFixture({
      runId: first.runId,
      taskId: first.taskId!,
      handoffRevision: 2,
      supersedesHandoffId: first.manifest.handoffId,
      supersedesEventId: first.recordedEventId,
      safeSummary: "Corrected safe presentation for the first multi-run handoff."
    });
    const manifests = new ManifestMap()
      .putFixture(first)
      .putFixture(firstCorrection)
      .putFixture(second);

    const projection = await project([
      ...validRecordedEvents(first),
      finalOutputStepEvent(firstCorrection),
      preparedEvent(firstCorrection),
      recordedEvent(firstCorrection),
      ...validRecordedEvents(second)
    ], manifests);

    expect(projection.state, JSON.stringify(projection.diagnostics)).toBe("handoff-recorded");
    expect(projection.diagnostics).toEqual([]);
    expect(projection.handoffs.map((handoff) => handoff.handoffId)).toEqual([
      first.manifest.handoffId,
      firstCorrection.manifest.handoffId,
      second.manifest.handoffId
    ]);
    expect(projection.selectedHandoff?.handoffId).toBe(second.manifest.handoffId);
    expect(projection.history).toContainEqual(expect.objectContaining({
      state: "handoff-recorded",
      handoffId: first.manifest.handoffId,
      supersededByHandoffId: firstCorrection.manifest.handoffId
    }));
  });

  it("projects task-completed only after an actual completed task event follows the verified handoff", async () => {
    const fixture = handoffFixture();
    const manifests = new ManifestMap().putFixture(fixture);

    const beforeTask = await project([
      ...validRecordedEvents(fixture),
      completedRunEvent(fixture, { causationId: fixture.recordedEventId })
    ], manifests);
    expect(beforeTask.state).toBe("handoff-recorded");

    const afterTask = await project([
      ...validRecordedEvents(fixture),
      completedRunEvent(fixture, { causationId: fixture.recordedEventId }),
      taskStatusEvent(fixture, "completed", { causationId: "evt_run_completed" })
    ], manifests);

    expect(afterTask.state).toBe("task-completed");
    expect(afterTask.selectedHandoff).toEqual(fixture.manifest.handoff);
  });

  it("fails closed when terminal run state is not caused by the matching recorded handoff", async () => {
    const cases: Array<readonly [string, readonly KnowledgeEvent[], string]> = [
      ["failed terminal", [
        ...validRecordedEvents(handoffFixture()),
        failedRunEvent(handoffFixture(), { causationId: handoffFixture().recordedEventId }),
        taskStatusEvent(handoffFixture(), "completed", { causationId: "evt_run_failed" })
      ], "terminal-status-mismatch"],
      ["missing completed-run causation", [
        ...validRecordedEvents(handoffFixture()),
        completedRunEvent(handoffFixture()),
        taskStatusEvent(handoffFixture(), "completed", { causationId: "evt_run_completed" })
      ], "terminal-causation-mismatch"],
      ["unrelated completed-run causation", [
        ...validRecordedEvents(handoffFixture()),
        completedRunEvent(handoffFixture(), { causationId: "evt_unrelated_handoff" }),
        taskStatusEvent(handoffFixture(), "completed", { causationId: "evt_run_completed" })
      ], "terminal-causation-mismatch"]
    ];

    for (const [label, events, code] of cases) {
      const fixture = handoffFixture();
      const projection = await project(
        events,
        new ManifestMap().putFixture(fixture)
      );

      expect(projection.state, label).toBe("inconsistent");
      expect(projection.diagnostics, label).toContainEqual(expect.objectContaining({ code }));
    }
  });

  it("requires completed task causation after the completed run terminal", async () => {
    const cases: Array<readonly [string, readonly KnowledgeEvent[]]> = [
      ["task completion before terminal", [
        ...validRecordedEvents(handoffFixture()),
        taskStatusEvent(handoffFixture(), "completed", { causationId: "evt_run_completed" }),
        completedRunEvent(handoffFixture(), { causationId: handoffFixture().recordedEventId })
      ]],
      ["missing task causation", [
        ...validRecordedEvents(handoffFixture()),
        completedRunEvent(handoffFixture(), { causationId: handoffFixture().recordedEventId }),
        taskStatusEvent(handoffFixture(), "completed")
      ]],
      ["unrelated task causation", [
        ...validRecordedEvents(handoffFixture()),
        completedRunEvent(handoffFixture(), { causationId: handoffFixture().recordedEventId }),
        taskStatusEvent(handoffFixture(), "completed", { causationId: "evt_unrelated_terminal" })
      ]]
    ];

    for (const [label, events] of cases) {
      const fixture = handoffFixture();
      const projection = await project(
        events,
        new ManifestMap().putFixture(fixture)
      );

      expect(projection.state, label).toBe("handoff-recorded");
      expect(projection.selectedHandoff?.handoffId, label).toBe(fixture.manifest.handoffId);
    }
  });

  it("does not synthesize a handoff from completed-run output hashes", async () => {
    const fixture = handoffFixture();

    const projection = await project([
      startedEvent(fixture),
      completedRunEvent(fixture, { outputArtifactHashes: [hash222] })
    ], new ManifestMap());

    expect(projection.handoffs).toEqual([]);
    expect(projection.selectedHandoff).toBeUndefined();
    expect(projection.state).toBe("inconsistent");
    expect(projection.diagnostics).toContainEqual(expect.objectContaining({
      code: "terminal-before-handoff"
    }));
  });

  it("fails closed when the manifest is missing, hash mismatched, malformed, or DTO mismatched", async () => {
    const fixture = handoffFixture();
    await expectInconsistent(validRecordedEvents(fixture), new ManifestMap(), "manifest-missing");

    const wrongManifest = handoffFixture({ runId: "run_wrong_manifest_001" });
    await expectInconsistent(
      validRecordedEvents(fixture),
      new ManifestMap().put(fixture.manifestHash, canonicalSpecialistHandoffJson(wrongManifest.manifest)),
      "manifest-hash-mismatch"
    );

    await expectInconsistent(
      validRecordedEvents(fixture),
      new ManifestMap().put(fixture.manifestHash, Buffer.from("{not json", "utf8")),
      "manifest-malformed"
    );

    const dtoMismatch = tamperedManifestFixture(fixture, (manifest) => {
      manifest.handoff.safeSummary = "Different nested DTO summary.";
      manifest.handoffDtoHash = hash333;
    });
    await expectInconsistent(
      validRecordedEvents(dtoMismatch),
      new ManifestMap().putFixture(dtoMismatch),
      "manifest-dto-mismatch"
    );
  });

  it("fails closed when safeSummary, status, refs, output hashes, tool requests, source events, or related events disagree", async () => {
    const cases: Array<readonly [string, HandoffFixture]> = [
      ["safeSummary", fixtureWithPreparedOverride({ safeSummary: "Different safe summary." })],
      ["status", fixtureWithRecordedOverride({ status: "blocked" })],
      ["refs", fixtureWithPreparedOverride({ contextPackHashes: [hash555] })],
      ["output hashes", fixtureWithPreparedOverride({ outputArtifactHashes: [hash333] })],
      ["tool requests", fixtureWithRecordedOverride({ toolRequestIds: ["toolreq_different"] })],
      ["source events", fixtureWithPreparedOverride({ sourceEventIds: ["evt_different_source"] })],
      ["related events", fixtureWithRecordedOverride({ relatedEventIds: ["evt_different_related"] })],
      ["optional task identity", fixtureWithRecordedOverride({ taskId: "task_handoff_001" }, { taskId: null })]
    ];

    for (const [label, fixture] of cases) {
      const projection = await project(
        validRecordedEvents(fixture),
        new ManifestMap().putFixture(fixture)
      );

      expect(projection.state, label).toBe("inconsistent");
      expect(projection.selectedHandoff, label).toBeUndefined();
      expect(projection.diagnostics, label).toContainEqual(expect.objectContaining({
        code: "compact-binding-mismatch"
      }));
    }
  });

  it("marks terminal-before-handoff historical state inconsistent", async () => {
    const fixture = handoffFixture();
    const projection = await project([
      startedEvent(fixture),
      finalOutputStepEvent(fixture),
      completedRunEvent(fixture),
      preparedEvent(fixture),
      recordedEvent(fixture)
    ], new ManifestMap().putFixture(fixture));

    expect(projection.state).toBe("inconsistent");
    expect(projection.diagnostics).toContainEqual(expect.objectContaining({
      code: "terminal-before-handoff"
    }));
  });

  it("keeps waiting-for-approval, blocked, and failed outcomes out of task-completed", async () => {
    const cases: Array<readonly [BuildSpecialistHandoffManifestInput["status"], KnowledgeEvent]> = [
      ["waiting-for-approval", taskStatusEvent(handoffFixture({ status: "waiting-for-approval" }), "waiting-for-approval")],
      ["blocked", taskStatusEvent(handoffFixture({ status: "blocked" }), "blocked")],
      ["failed", taskStatusEvent(handoffFixture({ status: "failed" }), "failed")]
    ];

    for (const [status, taskEvent] of cases) {
      const fixture = handoffFixture({ status });
      const terminal = status === "failed"
        ? failedRunEvent(fixture, { causationId: fixture.recordedEventId })
        : completedRunEvent(fixture, { causationId: fixture.recordedEventId });
      const projection = await project([
        ...validRecordedEvents(fixture),
        terminal,
        { ...taskEvent, payload: { ...taskEvent.payload, taskId: fixture.taskId!, runId: fixture.runId } } as KnowledgeEvent
      ], new ManifestMap().putFixture(fixture));

      expect(projection.state, status).toBe("handoff-recorded");
      expect(projection.selectedHandoff?.status, status).toBe(status);
    }
  });

  it("selects the latest valid non-superseded handoff and preserves prior handoffs", async () => {
    const first = handoffFixture();
    const correction = handoffFixture({
      handoffRevision: 2,
      supersedesHandoffId: first.manifest.handoffId,
      supersedesEventId: first.recordedEventId,
      safeSummary: "Corrected safe presentation summary."
    });
    const manifests = new ManifestMap()
      .putFixture(first)
      .putFixture(correction);

    const projection = await project([
      ...validRecordedEvents(first),
      finalOutputStepEvent(correction),
      preparedEvent(correction),
      recordedEvent(correction)
    ], manifests);

    expect(projection.state, JSON.stringify(projection.diagnostics)).toBe("handoff-recorded");
    expect(projection.handoffs.map((handoff) => handoff.handoffId)).toEqual([
      first.manifest.handoffId,
      correction.manifest.handoffId
    ]);
    expect(projection.selectedHandoff?.handoffId).toBe(correction.manifest.handoffId);
    expect(projection.history).toContainEqual(expect.objectContaining({
      state: "handoff-recorded",
      handoffId: first.manifest.handoffId,
      supersededByHandoffId: correction.manifest.handoffId
    }));
  });

  it("marks a same-revision presentation change with the unchanged handoffId and different manifest hash inconsistent", async () => {
    const first = handoffFixture();
    const sameRevisionChange = handoffFixture({
      handoffId: first.manifest.handoffId,
      handoffRevision: 1,
      safeSummary: "Changed summary without a new durable revision.",
      preparedEventId: "evt_handoff_prepared_same_revision",
      recordedEventId: "evt_handoff_recorded_same_revision"
    });
    const projection = await project([
      ...validRecordedEvents(first),
      preparedEvent(sameRevisionChange),
      recordedEvent(sameRevisionChange)
    ], new ManifestMap()
      .putFixture(first)
      .putFixture(sameRevisionChange));

    expect(projection.state).toBe("inconsistent");
    expect(projection.diagnostics).toContainEqual(expect.objectContaining({
      code: "conflicting-prepared"
    }));
  });

  it("fails closed when prepared events reuse a handoffId with different compact bindings", async () => {
    const first = handoffFixture();
    const conflictingPrepared = handoffFixture({
      handoffId: first.manifest.handoffId,
      handoffRevision: 1,
      safeSummary: "Conflicting prepared summary under the same durable handoff ID.",
      preparedEventId: "evt_handoff_prepared_conflicting_same_handoff_id",
      recordedEventId: "evt_handoff_recorded_conflicting_same_handoff_id"
    });

    const projection = await project([
      startedEvent(first),
      finalOutputStepEvent(first),
      preparedEvent(first),
      preparedEvent(conflictingPrepared)
    ], new ManifestMap()
      .putFixture(first)
      .putFixture(conflictingPrepared));

    expect(projection.state).toBe("inconsistent");
    expect(projection.selectedHandoff).toBeUndefined();
    expect(projection.diagnostics).toContainEqual(expect.objectContaining({
      code: "conflicting-prepared",
      handoffId: first.manifest.handoffId
    }));
  });

  it("accepts presentation correction only as an incremented revision with supersedesHandoffId and a new handoffId", async () => {
    const first = handoffFixture();
    const correction = handoffFixture({
      handoffRevision: 2,
      supersedesHandoffId: first.manifest.handoffId,
      supersedesEventId: first.recordedEventId,
      safeSummary: "Corrected safe handoff presentation."
    });

    const projection = await project([
      ...validRecordedEvents(first),
      finalOutputStepEvent(correction),
      preparedEvent(correction),
      recordedEvent(correction)
    ], new ManifestMap()
      .putFixture(first)
      .putFixture(correction));

    expect(correction.manifest.handoffId).not.toBe(first.manifest.handoffId);
    expect(projection.state).toBe("handoff-recorded");
    expect(projection.selectedHandoff).toEqual(correction.manifest.handoff);
    expect(projection.diagnostics).toEqual([]);
  });

  it("keeps task-completed after a valid post-terminal presentation supersession", async () => {
    const first = handoffFixture();
    const correction = handoffFixture({
      handoffRevision: 2,
      supersedesHandoffId: first.manifest.handoffId,
      supersedesEventId: first.recordedEventId,
      safeSummary: "Corrected safe presentation after task completion."
    });
    const manifests = new ManifestMap()
      .putFixture(first)
      .putFixture(correction);

    const projection = await project([
      ...validRecordedEvents(first),
      finalOutputStepEvent(correction),
      completedRunEvent(first, { causationId: first.recordedEventId }),
      taskStatusEvent(first, "completed", { causationId: "evt_run_completed" }),
      finalOutputStepEvent(correction),
      preparedEvent(correction),
      recordedEvent(correction)
    ], manifests);

    expect(projection.state).toBe("task-completed");
    expect(projection.selectedHandoff).toEqual(correction.manifest.handoff);
    expect(projection.selectedHandoff?.handoffRevision).toBe(2);
    expect(projection.handoffs.map((handoff) => handoff.handoffId)).toEqual([
      first.manifest.handoffId,
      correction.manifest.handoffId
    ]);
    expect(projection.history).toContainEqual(expect.objectContaining({
      state: "handoff-recorded",
      handoffId: first.manifest.handoffId,
      supersededByHandoffId: correction.manifest.handoffId
    }));
    expect(projection.history).toContainEqual(expect.objectContaining({
      state: "task-completed",
      handoffId: correction.manifest.handoffId
    }));
  });

  it("keeps a post-terminal supersession final-output restartable when a crash occurs before prepared", async () => {
    const first = handoffFixture();
    const correction = handoffFixture({
      handoffRevision: 2,
      supersedesHandoffId: first.manifest.handoffId,
      supersedesEventId: first.recordedEventId,
      safeSummary: "Corrected safe presentation persisted before prepared."
    });

    const projection = await project([
      ...validRecordedEvents(first),
      completedRunEvent(first, { causationId: first.recordedEventId }),
      taskStatusEvent(first, "completed", { causationId: "evt_run_completed" }),
      finalOutputStepEvent(correction)
    ], new ManifestMap()
      .putFixture(first)
      .putFixture(correction));

    expect(projection.state, JSON.stringify(projection.diagnostics)).toBe("task-completed");
    expect(projection.selectedHandoff).toEqual(first.manifest.handoff);
    expect(projection.diagnostics).toEqual([]);
    expect(projection.history).toContainEqual(expect.objectContaining({
      state: "output-persisted",
      runId: correction.runId,
      finalOutputEventId: correction.finalOutputEventId,
      artifactHashes: correction.manifest.outputArtifacts.map((artifact) => artifact.artifactHash)
    }));
    expect(projection.handoffs.map((handoff) => handoff.handoffId)).toEqual([first.manifest.handoffId]);
  });

  it("rejects handoff causation and revision supersession violations", async () => {
    const first = handoffFixture();
    const correction = handoffFixture({
      handoffRevision: 2,
      supersedesHandoffId: first.manifest.handoffId,
      supersedesEventId: first.recordedEventId,
      safeSummary: "Corrected safe handoff presentation."
    });
    const revisionWithoutSupersession = handoffFixture({
      handoffRevision: 2,
      preparedEventId: "evt_handoff_prepared_revision_without_supersession",
      recordedEventId: "evt_handoff_recorded_revision_without_supersession"
    });

    const cases: Array<readonly [string, readonly KnowledgeEvent[], readonly HandoffFixture[], string]> = [
      ["wrong first prepared causation", [
        startedEvent(first),
        finalOutputStepEvent(first),
        preparedEvent(first, "evt_unrelated_final_output"),
        recordedEvent(first)
      ], [first], "handoff-causation-mismatch"],
      ["wrong supersession prepared causation", [
        ...validRecordedEvents(first),
        finalOutputStepEvent(correction),
        preparedEvent(correction, "evt_unrelated_recorded"),
        recordedEvent(correction)
      ], [first, correction], "handoff-causation-mismatch"],
      ["wrong recorded causation", [
        startedEvent(first),
        finalOutputStepEvent(first),
        preparedEvent(first),
        recordedEvent(first, "evt_unrelated_prepared")
      ], [first], "handoff-causation-mismatch"],
      ["higher revision without supersedesHandoffId", [
        startedEvent(revisionWithoutSupersession),
        finalOutputStepEvent(revisionWithoutSupersession),
        preparedEvent(revisionWithoutSupersession),
        recordedEvent(revisionWithoutSupersession)
      ], [revisionWithoutSupersession], "supersession-violation"]
    ];

    for (const [label, events, fixtures, code] of cases) {
      const manifests = new ManifestMap();
      for (const fixture of fixtures) {
        manifests.putFixture(fixture);
      }

      const projection = await project(events, manifests);
      expect(projection.state, label).toBe("inconsistent");
      expect(projection.diagnostics, label).toContainEqual(expect.objectContaining({ code }));
    }
  });

  it("rejects supersession cycles, cross-run supersession, missing prior handoff, and changed output refs", async () => {
    const first = handoffFixture();
    const missingPrior = handoffFixture({
      handoffRevision: 2,
      supersedesHandoffId: "handoff_run_handoff_001_ffffffffffffffff",
      supersedesEventId: "evt_missing_recorded",
      preparedEventId: "evt_handoff_prepared_missing_prior",
      recordedEventId: "evt_handoff_recorded_missing_prior"
    });
    await expectSupersessionViolation([preparedEvent(missingPrior), recordedEvent(missingPrior)], [missingPrior]);

    const crossRun = handoffFixture({
      runId: "run_handoff_other_001",
      handoffRevision: 2,
      supersedesHandoffId: first.manifest.handoffId,
      supersedesEventId: first.recordedEventId,
      preparedEventId: "evt_handoff_prepared_cross_run",
      recordedEventId: "evt_handoff_recorded_cross_run"
    });
    await expectSupersessionViolation([
      ...validRecordedEvents(first),
      startedEvent(crossRun),
      finalOutputStepEvent(crossRun),
      preparedEvent(crossRun),
      recordedEvent(crossRun)
    ], [first, crossRun]);

    const changedOutput = handoffFixture({
      handoffRevision: 2,
      outputArtifacts: [outputArtifact(hash333)],
      supersedesHandoffId: first.manifest.handoffId,
      supersedesEventId: first.recordedEventId,
      preparedEventId: "evt_handoff_prepared_changed_output",
      recordedEventId: "evt_handoff_recorded_changed_output"
    });
    await expectSupersessionViolation([
      ...validRecordedEvents(first),
      finalOutputStepEvent(changedOutput),
      preparedEvent(changedOutput),
      recordedEvent(changedOutput)
    ], [first, changedOutput]);

    const changedOutputDescriptor = handoffFixture({
      handoffRevision: 2,
      outputArtifacts: [{ ...outputArtifact(first.manifest.outputArtifacts[0]!.artifactHash), artifactKind: "changed-output-kind" }],
      supersedesHandoffId: first.manifest.handoffId,
      supersedesEventId: first.recordedEventId,
      preparedEventId: "evt_handoff_prepared_changed_output_descriptor",
      recordedEventId: "evt_handoff_recorded_changed_output_descriptor"
    });
    await expectSupersessionViolation([
      ...validRecordedEvents(first),
      finalOutputStepEvent(changedOutputDescriptor),
      preparedEvent(changedOutputDescriptor),
      recordedEvent(changedOutputDescriptor)
    ], [first, changedOutputDescriptor]);

    const changedPrompt = handoffFixture({
      handoffRevision: 2,
      promptArtifactHash: hash555,
      supersedesHandoffId: first.manifest.handoffId,
      supersedesEventId: first.recordedEventId,
      preparedEventId: "evt_handoff_prepared_changed_prompt",
      recordedEventId: "evt_handoff_recorded_changed_prompt"
    });
    await expectSupersessionViolation([
      ...validRecordedEvents(first),
      preparedEvent(changedPrompt),
      recordedEvent(changedPrompt)
    ], [first, changedPrompt]);

    const changedContext = handoffFixture({
      handoffRevision: 2,
      contextPackRefs: [contextPackRef(hash555)],
      supersedesHandoffId: first.manifest.handoffId,
      supersedesEventId: first.recordedEventId,
      preparedEventId: "evt_handoff_prepared_changed_context",
      recordedEventId: "evt_handoff_recorded_changed_context"
    });
    await expectSupersessionViolation([
      ...validRecordedEvents(first),
      preparedEvent(changedContext),
      recordedEvent(changedContext)
    ], [first, changedContext]);

    const cycleHead = handoffFixture({
      handoffRevision: 2,
      supersedesHandoffId: "handoff_run_handoff_001_eeeeeeeeeeeeeeee",
      supersedesEventId: "evt_handoff_recorded_cycle_tail",
      preparedEventId: "evt_handoff_prepared_cycle_head",
      recordedEventId: "evt_handoff_recorded_cycle_head"
    });
    const cycleTail = handoffFixture({
      handoffRevision: 3,
      supersedesHandoffId: cycleHead.manifest.handoffId,
      supersedesEventId: cycleHead.recordedEventId,
      preparedEventId: "evt_handoff_prepared_cycle_tail",
      recordedEventId: "evt_handoff_recorded_cycle_tail"
    });
    await expectSupersessionViolation([
      preparedEvent(cycleHead),
      recordedEvent(cycleHead),
      preparedEvent(cycleTail),
      recordedEvent(cycleTail)
    ], [cycleHead, cycleTail]);
  });
});

class ManifestMap implements SpecialistHandoffManifestReader {
  private readonly manifests = new Map<`sha256:${string}`, Buffer>();

  put(contentHash: `sha256:${string}`, bytes: Buffer): ManifestMap {
    this.manifests.set(contentHash, Buffer.from(bytes));
    return this;
  }

  putFixture(fixture: HandoffFixture): ManifestMap {
    return this
      .put(fixture.manifestHash, canonicalSpecialistHandoffJson(fixture.manifest))
      .put(fixture.materialHash, canonicalSpecialistHandoffMaterialBytes(fixture.material));
  }

  async get(contentHash: `sha256:${string}`): Promise<Buffer> {
    const manifest = this.manifests.get(contentHash);
    if (manifest === undefined) {
      throw new Error("manifest is missing");
    }
    return Buffer.from(manifest);
  }
}

function materializedStore(fixture: HandoffFixture): ManifestMap {
  return new ManifestMap()
    .putFixture(fixture)
    .put(fixture.materialHash, canonicalSpecialistHandoffMaterialBytes(fixture.material));
}

interface HandoffFixture {
  readonly runId: string;
  readonly taskId?: string;
  readonly runType: "evidence-triage" | "ontology-bootstrap";
  readonly status: BuildSpecialistHandoffManifestInput["status"];
  readonly finalOutputEventId: string;
  readonly finalOutputStepId: string;
  readonly preparedEventId: string;
  readonly recordedEventId: string;
  readonly manifest: SpecialistHandoffManifest;
  readonly manifestHash: `sha256:${string}`;
  readonly material: SpecialistHandoffMaterial;
  readonly materialHash: `sha256:${string}`;
  readonly preparedPayload: KnowledgeEventOf<"agent.specialist-handoff.prepared">["payload"];
  readonly recordedPayload: KnowledgeEventOf<"agent.specialist-handoff.recorded">["payload"];
}

interface ProjectionFilter {
  readonly runId?: string;
  readonly taskId?: string;
}

async function project(events: readonly KnowledgeEvent[], manifestReader: SpecialistHandoffManifestReader, filter: ProjectionFilter = {}) {
  return buildSpecialistHandoffProjection({ events, manifestReader, ...filter });
}

async function expectInconsistent(
  events: readonly KnowledgeEvent[],
  manifestReader: SpecialistHandoffManifestReader,
  code: string
): Promise<void> {
  const projection = await project(events, manifestReader);
  expect(projection.state).toBe("inconsistent");
  expect(projection.selectedHandoff).toBeUndefined();
  expect(projection.diagnostics).toContainEqual(expect.objectContaining({ code }));
}

async function expectSupersessionViolation(extraEvents: readonly KnowledgeEvent[], fixtures: readonly HandoffFixture[]): Promise<void> {
  const manifests = new ManifestMap();
  for (const fixture of fixtures) {
    manifests.putFixture(fixture);
  }
  const projection = await project([
    startedEvent(fixtures[0]!),
    finalOutputStepEvent(fixtures[0]!),
    ...extraEvents
  ], manifests);

  expect(projection.state).toBe("inconsistent");
  expect(projection.diagnostics).toContainEqual(expect.objectContaining({
    code: "supersession-violation"
  }));
}

function validRecordedEvents(fixture: HandoffFixture): readonly KnowledgeEvent[] {
  return [
    startedEvent(fixture),
    finalOutputStepEvent(fixture),
    preparedEvent(fixture),
    recordedEvent(fixture)
  ];
}

function handoffFixture(options: {
  readonly runId?: string;
  readonly taskId?: string | null;
  readonly runType?: HandoffFixture["runType"];
  readonly status?: BuildSpecialistHandoffManifestInput["status"];
  readonly safeSummary?: string;
  readonly handoffId?: string;
  readonly handoffRevision?: number;
  readonly outputArtifacts?: readonly BuildSpecialistHandoffManifestInput["outputArtifacts"][number][];
  readonly contextPackRefs?: readonly BuildSpecialistHandoffManifestInput["contextPackRefs"][number][];
  readonly toolRequestIds?: readonly string[];
  readonly approvalRequirements?: readonly BuildSpecialistHandoffManifestInput["approvalRequirements"][number][];
  readonly nextSafeActions?: readonly BuildSpecialistHandoffManifestInput["nextSafeActions"][number][];
  readonly failure?: BuildSpecialistHandoffManifestInput["failure"];
  readonly promptArtifactHash?: `sha256:${string}`;
  readonly supersedesHandoffId?: string;
  readonly supersedesEventId?: string;
  readonly finalOutputEventId?: string;
  readonly preparedEventId?: string;
  readonly recordedEventId?: string;
  readonly preparedPayloadOverride?: Partial<KnowledgeEventOf<"agent.specialist-handoff.prepared">["payload"]>;
  readonly recordedPayloadOverride?: Partial<KnowledgeEventOf<"agent.specialist-handoff.recorded">["payload"]>;
} = {}): HandoffFixture {
  const runId = options.runId ?? "run_handoff_001";
  const taskId = options.taskId === null ? undefined : options.taskId ?? "task_handoff_001";
  const runType = options.runType ?? "evidence-triage";
  const status = options.status ?? "ready-for-review";
  const sourceEventId = `evt_started_${runId}`;
  const handoffRevision = options.handoffRevision ?? 1;
  const finalOutputEventId = options.finalOutputEventId ?? (handoffRevision === 1 ? "evt_final_output" : `evt_final_output_revision_${handoffRevision}`);
  const outputArtifacts = options.outputArtifacts ?? [outputArtifact(hash222)];
  const contextPackRefs = options.contextPackRefs ?? [contextPackRef(hash444, sourceEventId)];
  const seed = {
    runId,
    ...(taskId === undefined ? {} : { taskId }),
    runType,
    status,
    finalOutputEventId,
    outputArtifactHashes: outputArtifacts.map((artifact) => artifact.artifactHash),
    handoffRevision,
    ...(options.supersedesHandoffId === undefined ? {} : { supersedesHandoffId: options.supersedesHandoffId })
  } as const;
  const handoffId = options.handoffId ?? computeSpecialistHandoffId(seed);
  const material = buildSpecialistHandoffMaterial({
    status,
    safeSummary: options.safeSummary ?? safeSummaryFor(status),
    contextPackRefs,
    promptArtifactHash: options.promptArtifactHash ?? hash111,
    outputArtifacts,
    toolRequestIds: options.toolRequestIds ?? [],
    approvalRequirements: options.approvalRequirements ?? (status === "waiting-for-approval" ? [{ approvalClass: "provider-byte-transfer", reason: "Human approval is required before the next safe action." }] : []),
    nextSafeActions: options.nextSafeActions ?? [{ actionId: "action_review_handoff", label: "Review durable handoff", kind: "review", effect: status === "waiting-for-approval" ? "request-approval" : "none", artifactId: outputArtifacts[0]!.artifactId }],
    ...(options.failure === undefined
      ? (status === "failed" ? { failure: { category: "model-output-invalid", code: "model-output-invalid", safeSummary: "Model output could not be converted into a durable handoff.", retryable: true } } : {})
      : { failure: options.failure }),
    sourceEventIds: [sourceEventId],
    relatedEventIds: [sourceEventId],
    ...(options.supersedesHandoffId === undefined ? {} : { supersedesHandoffId: options.supersedesHandoffId }),
    ...(options.supersedesEventId === undefined ? {} : { supersedesEventId: options.supersedesEventId })
  });
  const materialHash = hashSpecialistHandoffMaterial(material);
  const manifestInput: BuildSpecialistHandoffManifestInput = {
    handoffId,
    handoffRevision,
    runId,
    ...(taskId === undefined ? {} : { taskId }),
    runType,
    residentAgentId: "agent_default",
    generatedAt: "2026-07-10T15:00:00.000Z",
    status,
    safeSummary: options.safeSummary ?? safeSummaryFor(status),
    stateKind: status === "failed" ? "failed" : status === "ready-for-review" ? "completed" : "resumable",
    finalOutputStepId: "step_run_handoff_001_final_output",
    finalOutputEventId,
    handoffMaterialArtifactHash: materialHash,
    contextPackRefs,
    promptArtifactHash: options.promptArtifactHash ?? hash111,
    outputArtifacts,
    toolRequestIds: options.toolRequestIds ?? [],
    approvalRequirements: options.approvalRequirements ?? (status === "waiting-for-approval"
      ? [{
        approvalClass: "provider-byte-transfer",
        reason: "Human approval is required before the next safe action.",
      }]
      : []),
    nextSafeActions: options.nextSafeActions ?? [{
      actionId: "action_review_handoff",
      label: "Review durable handoff",
      kind: "review",
      effect: status === "waiting-for-approval" ? "request-approval" : "none",
      artifactId: outputArtifacts[0]!.artifactId
    }],
    ...(options.failure === undefined
      ? (status === "failed"
      ? {
        failure: {
          category: "model-output-invalid",
          code: "model-output-invalid",
          safeSummary: "Model output could not be converted into a durable handoff.",
          retryable: true
        }
      }
      : {})
      : { failure: options.failure }),
    sourceEventIds: [sourceEventId],
    relatedEventIds: [sourceEventId],
    ...(options.supersedesHandoffId === undefined ? {} : { supersedesHandoffId: options.supersedesHandoffId }),
    ...(options.supersedesEventId === undefined ? {} : { supersedesEventId: options.supersedesEventId })
  };
  const manifest = buildSpecialistHandoffManifest(manifestInput);
  const manifestHash = hashSpecialistHandoffManifest(manifest);
  const eventIdSuffix = `${runId}_${handoffRevision}`.replace(/[^a-zA-Z0-9_-]/g, "_");
  const preparedEventId = options.preparedEventId ?? `evt_handoff_prepared_${eventIdSuffix}`;
  const recordedEventId = options.recordedEventId ?? `evt_handoff_recorded_${eventIdSuffix}`;
  const preparedPayload = {
    ...compactBinding(manifest, manifestHash),
    ...options.preparedPayloadOverride
  };
  const recordedPayload = {
    ...compactBinding(manifest, manifestHash),
    preparedEventId,
    verifiedAt: "2026-07-10T15:01:00.000Z",
    ...options.recordedPayloadOverride
  };

  return {
    runId,
    ...(taskId === undefined ? {} : { taskId }),
    runType,
    status,
    finalOutputEventId,
    finalOutputStepId: manifest.finalOutputStepId,
    preparedEventId,
    recordedEventId,
    manifest,
    manifestHash,
    material,
    materialHash,
    preparedPayload,
    recordedPayload
  };
}

function fixtureWithPreparedOverride(
  preparedPayloadOverride: Partial<KnowledgeEventOf<"agent.specialist-handoff.prepared">["payload"]>,
  options: Parameters<typeof handoffFixture>[0] = {}
): HandoffFixture {
  return handoffFixture({ ...options, preparedPayloadOverride });
}

function fixtureWithRecordedOverride(
  recordedPayloadOverride: Partial<KnowledgeEventOf<"agent.specialist-handoff.recorded">["payload"]>,
  options: Parameters<typeof handoffFixture>[0] = {}
): HandoffFixture {
  return handoffFixture({ ...options, recordedPayloadOverride });
}

function tamperedManifestFixture(
  fixture: HandoffFixture,
  mutator: (manifest: Record<string, any>) => void
): HandoffFixture {
  const manifest = JSON.parse(canonicalSpecialistHandoffJson(fixture.manifest).toString("utf8")) as Record<string, any>;
  mutator(manifest);
  const manifestHash = hashSpecialistHandoffManifest(manifest);
  return {
    ...fixture,
    manifest: manifest as SpecialistHandoffManifest,
    manifestHash,
    preparedPayload: {
      ...fixture.preparedPayload,
      handoffManifestHash: manifestHash
    },
    recordedPayload: {
      ...fixture.recordedPayload,
      handoffManifestHash: manifestHash
    }
  };
}

function compactBinding(
  manifest: SpecialistHandoffManifest,
  handoffManifestHash: `sha256:${string}`
): KnowledgeEventOf<"agent.specialist-handoff.prepared">["payload"] {
  return {
    handoffId: manifest.handoffId,
    handoffRevision: manifest.handoffRevision,
    idempotencyKey: `specialist-handoff:${manifest.runId}:${manifest.taskId ?? "none"}:${manifest.runType}:${manifest.status}:${handoffManifestHash}`,
    handoffManifestHash,
    handoffMaterialArtifactHash: manifest.handoffMaterialArtifactHash,
    handoffDtoHash: manifest.handoffDtoHash,
    runId: manifest.runId,
    ...(manifest.taskId === undefined ? {} : { taskId: manifest.taskId }),
    runType: manifest.runType as HandoffFixture["runType"],
    residentAgentId: manifest.residentAgentId,
    status: manifest.status,
    safeSummary: manifest.safeSummary,
    finalOutputStepId: manifest.finalOutputStepId,
    finalOutputEventId: manifest.finalOutputEventId,
    contextPackHashes: manifest.contextPackRefs.map((ref) => ref.contentHash),
    ...(manifest.promptArtifactHash === undefined ? {} : { promptArtifactHash: manifest.promptArtifactHash }),
    outputArtifactHashes: manifest.outputArtifacts.map((artifact) => artifact.artifactHash),
    toolRequestIds: [...manifest.toolRequestIds],
    sourceEventIds: [...manifest.sourceEventIds],
    relatedEventIds: [...manifest.relatedEventIds],
    ...(manifest.supersedesHandoffId === undefined ? {} : { supersedesHandoffId: manifest.supersedesHandoffId }),
    ...(manifest.supersedesEventId === undefined ? {} : { supersedesEventId: manifest.supersedesEventId })
  };
}

function startedEvent(fixture: Pick<HandoffFixture, "runId" | "runType" | "taskId">): KnowledgeEventOf<"agent.specialist-run.started"> {
  return agentEvent("agent.specialist-run.started", `evt_started_${fixture.runId}`, {
    runId: fixture.runId,
    residentAgentId: "agent_default",
    runType: fixture.runType,
    startedBy: "actor_cestus_agent",
    ...(fixture.taskId === undefined ? {} : { taskId: fixture.taskId }),
    sourceEventIds: ["evt_source_001"],
    inputArtifactHashes: [hash111]
  });
}

function finalOutputStepEvent(fixture: HandoffFixture): KnowledgeEventOf<"agent.specialist-run.step.recorded"> {
  return specialistStepEvent(fixture, {
    id: fixture.finalOutputEventId,
    stepId: fixture.finalOutputStepId,
    payload: {
      summary: "Final durable output artifacts are persisted.",
      stepKind: "final-output",
      stepSchemaId: fixture.runType === "ontology-bootstrap"
        ? "ontology-bootstrap-handoff.v1"
        : "evidence-triage-handoff.v1",
      idempotencyKey: `specialist-final-output:${fixture.runId}:${fixture.taskId ?? "none"}:${fixture.runType}:${fixture.status}:${fixture.materialHash}`,
      handoffMaterialArtifactHash: fixture.materialHash,
      inputArtifactHashes: [...new Set([...fixture.manifest.contextPackRefs.flatMap((ref) => [ref.contentHash, ...(ref.artifactHashes ?? [])]), ...(fixture.manifest.promptArtifactHash === undefined ? [] : [fixture.manifest.promptArtifactHash])])],
      outputArtifactHashes: fixture.manifest.outputArtifacts.map((artifact) => artifact.artifactHash)
    }
  });
}

function specialistStepEvent(
  fixture: Pick<HandoffFixture, "runId">,
  input: {
    readonly id: string;
    readonly stepId: string;
    readonly payload: Omit<Partial<KnowledgeEventOf<"agent.specialist-run.step.recorded">["payload"]>, "runId" | "stepId">;
  }
): KnowledgeEventOf<"agent.specialist-run.step.recorded"> {
  return agentEvent("agent.specialist-run.step.recorded", input.id, {
    runId: fixture.runId,
    stepId: input.stepId,
    summary: input.payload.summary ?? "Specialist audit step.",
    ...(input.payload.stepKind === undefined ? {} : { stepKind: input.payload.stepKind }),
    ...(input.payload.stepSchemaId === undefined ? {} : { stepSchemaId: input.payload.stepSchemaId }),
    ...(input.payload.idempotencyKey === undefined ? {} : { idempotencyKey: input.payload.idempotencyKey }),
    ...(input.payload.handoffMaterialArtifactHash === undefined ? {} : { handoffMaterialArtifactHash: input.payload.handoffMaterialArtifactHash }),
    ...(input.payload.sourceEventIds === undefined ? {} : { sourceEventIds: input.payload.sourceEventIds }),
    ...(input.payload.inputArtifactHashes === undefined ? {} : { inputArtifactHashes: input.payload.inputArtifactHashes }),
    ...(input.payload.outputArtifactHashes === undefined ? {} : { outputArtifactHashes: input.payload.outputArtifactHashes }),
    ...(input.payload.invocationId === undefined ? {} : { invocationId: input.payload.invocationId }),
    ...(input.payload.toolRequestId === undefined ? {} : { toolRequestId: input.payload.toolRequestId })
  });
}

function preparedEvent(
  fixture: HandoffFixture,
  causationId = fixture.manifest.supersedesEventId ?? fixture.finalOutputEventId
): KnowledgeEventOf<"agent.specialist-handoff.prepared"> {
  return agentEvent("agent.specialist-handoff.prepared", fixture.preparedEventId, fixture.preparedPayload, {
    causationId
  });
}

function recordedEvent(
  fixture: HandoffFixture,
  causationId = fixture.preparedEventId
): KnowledgeEventOf<"agent.specialist-handoff.recorded"> {
  return agentEvent("agent.specialist-handoff.recorded", fixture.recordedEventId, fixture.recordedPayload, {
    causationId
  });
}

function completedRunEvent(
  fixture: Pick<HandoffFixture, "runId" | "manifest">,
  options: { readonly causationId?: string; readonly outputArtifactHashes?: readonly `sha256:${string}`[] } = {}
): KnowledgeEventOf<"agent.specialist-run.completed"> {
  return agentEvent("agent.specialist-run.completed", "evt_run_completed", {
    runId: fixture.runId,
    completedAt: "2026-07-10T15:02:00.000Z",
    outputArtifactHashes: [...(options.outputArtifactHashes ?? fixture.manifest.outputArtifacts.map((artifact) => artifact.artifactHash))],
    relatedEventIds: [fixture.manifest.finalOutputEventId],
    summary: "Specialist run reached terminal local state."
  }, eventOptions(options.causationId));
}

function failedRunEvent(
  fixture: Pick<HandoffFixture, "runId" | "recordedEventId">,
  options: { readonly causationId?: string } = {}
): KnowledgeEventOf<"agent.specialist-run.failed"> {
  return agentEvent("agent.specialist-run.failed", "evt_run_failed", {
    runId: fixture.runId,
    failedAt: "2026-07-10T15:02:00.000Z",
    category: "model-output-invalid",
    message: "Failed specialist result was safely recorded for review.",
    retryable: true,
    allowedActions: ["inspect-retry"],
    relatedEventIds: [fixture.recordedEventId]
  }, eventOptions(options.causationId));
}

function taskStatusEvent(
  fixture: Pick<HandoffFixture, "taskId" | "runId">,
  status: KnowledgeEventOf<"agent.task.status.changed">["payload"]["status"],
  options: { readonly causationId?: string } = {}
): KnowledgeEventOf<"agent.task.status.changed"> {
  return agentEvent("agent.task.status.changed", `evt_task_${status}`, {
    taskId: fixture.taskId ?? "task_handoff_001",
    status,
    changedBy: "actor_cestus_agent",
    reason: `Task moved to ${status} after durable handoff replay.`,
    runId: fixture.runId
  }, eventOptions(options.causationId));
}

function agentEvent<Type extends KnowledgeEvent["type"]>(
  type: Type,
  id: string,
  payload: KnowledgeEventOf<Type>["payload"],
  options: { readonly causationId?: string } = {}
): KnowledgeEventOf<Type> {
  return {
    id,
    type,
    version: 1,
    streamId: streamIdFor(type, payload),
    sequence: 1,
    context: {
      actor: { id: "actor_cestus_agent", kind: "agent", label: "Cestus Agent" },
      occurredAt: "2026-07-10T15:00:00.000Z",
      correlationId: "corr_handoff_projection",
      ...(options.causationId === undefined ? {} : { causationId: options.causationId }),
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", agent: "0.1.0" }
    },
    payload
  } as unknown as KnowledgeEventOf<Type>;
}

function eventOptions(causationId: string | undefined): { readonly causationId?: string } {
  return causationId === undefined ? {} : { causationId };
}

function streamIdFor(type: KnowledgeEvent["type"], payload: unknown): string {
  const record = payload as Record<string, unknown>;
  if (type.startsWith("agent.task.")) return `agent_task_${record.taskId}`;
  if (type.startsWith("agent.specialist-run.") || type.startsWith("agent.specialist-handoff.")) return `agent_run_${record.runId}`;
  return `agent_${type.replace(/\./g, "_")}`;
}

function contextPackRef(contentHash: `sha256:${string}` = hash444, sourceEventId = "evt_source_001") {
  return {
    contextPackId: "task-run-history.v1",
    version: 1,
    contentHash,
    sizeBytes: 256,
    generatedAt: "2026-07-10T14:55:00.000Z",
    safeSummary: "Prior task and run history.",
    provenanceRefs: [sourceEventId],
    sourceEventIds: [sourceEventId],
    artifactHashes: [hash111]
  };
}

function outputArtifact(artifactHash: `sha256:${string}`) {
  return {
    artifactId: `artifact_handoff_${artifactHash.slice("sha256:".length, "sha256:".length + 8)}`,
    artifactKind: "triage-dossier",
    schemaId: "evidence-triage-handoff.v1",
    artifactHash,
    safeSummary: "Durable local output artifact hash is ready for review."
  };
}

function safeSummaryFor(status: BuildSpecialistHandoffManifestInput["status"]): string {
  switch (status) {
    case "waiting-for-approval":
      return "Evidence triage handoff is waiting for human approval.";
    case "blocked":
      return "Evidence triage handoff is blocked with a safe repair action.";
    case "failed":
      return "Evidence triage handoff records a failed specialist result.";
    default:
      return "Evidence triage handoff is ready for human review.";
  }
}
