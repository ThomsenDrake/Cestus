import { describe, expect, it } from "vitest";

interface ResidentPlanCandidateProviderApi {
  createResidentPlanCandidateProvider(): {
    createInitialCandidate(input: unknown): Promise<unknown>;
    createReplanCandidate(input: unknown): Promise<unknown>;
  };
}

const hash = (character: string) => `sha256:${character.repeat(64)}`;

const posture = deepFreeze({
  schemaVersion: "resident-loop-provider-posture.v1",
  residentAgentId: "agent_default",
  workspace: {
    workspaceId: "ws_c136_p",
    mountInstanceId: "mount_c136_p",
    admissionGenerationId: "admission_generation_1",
    policyVersion: "policy_c136_p_v1",
    policyDigest: hash("a"),
    lockStateDigest: hash("b"),
    highWaterMark: "evt_source_002",
    highWaterOrdinal: 2
  },
  run: {
    taskId: "task_c136_p",
    attemptId: "attempt_c136_p",
    runId: "run_c136_p"
  },
  selection: {
    providerId: "provider_c136_p",
    modelId: "model_c136_p",
    adapterVersion: "adapter_c136_p_v1",
    selectionPolicyVersion: "policy_c136_p_v1",
    endpointPolicyId: "endpoint_policy_c136_p"
  },
  capability: {
    capabilityId: "provider_c136_p",
    capabilityVersion: "agent-provider-capability.v2",
    capabilityHash: hash("c"),
    capabilitySourceEventId: "evt_capability_c136_p",
    capabilityRevision: "capability_revision_c136_p"
  },
  credentialReference: {
    credentialRefId: "agent_credref_c136_p",
    credentialKind: "api-key-bearer",
    sourceEventIds: ["evt_credential_c136_p"]
  },
  feasibility: {
    feasibilityId: "provider_feasibility_c136_p",
    lane: "byok",
    assessedAt: "2026-07-19T00:00:00.000Z",
    sourceEventIds: ["evt_capability_c136_p", "evt_credential_c136_p", "evt_endpoint_policy_c136_p"]
  },
  approval: {
    required: true,
    approvalProfile: "remote-byte-transfer-gated",
    requiredApprovalClass: "provider-byte-transfer"
  },
  binding: {
    promptArtifactHash: hash("d"),
    approvalPreviewHash: hash("e")
  }
});

const constraints = deepFreeze({
  toolAllowlist: [{
    toolId: "tool_read_workspace",
    toolVersion: "1.0.0",
    allowlistEntryHash: hash("f"),
    expectedSafeOutputClass: "observation",
    prerequisiteStepOrdinals: [],
    sideEffectClass: "read-only",
    requiredApprovalClass: "none"
  }, {
    toolId: "tool_build_derivative",
    toolVersion: "1.0.0",
    allowlistEntryHash: hash("1"),
    expectedSafeOutputClass: "derivative",
    prerequisiteStepOrdinals: [1],
    sideEffectClass: "local-derivative",
    requiredApprovalClass: "human-review"
  }],
  permittedAutomaticActionClasses: ["read-only", "local-derivative"],
  requiredApprovalClasses: ["none", "human-review", "provider-byte-transfer"]
});

const initialPlan = deepFreeze({
  schemaVersion: "resident-plan-record.v2",
  residentAgentId: "agent_default",
  workspaceId: "ws_c136_p",
  taskId: "task_c136_p",
  attemptId: "attempt_c136_p",
  runId: "run_c136_p",
  runMode: "evidence-triage",
  workflowDescriptor: {
    workflowDescriptorId: "workflow_evidence_triage",
    workflowDescriptorVersion: "v1",
    workflowDescriptorHash: hash("2")
  },
  policy: {
    policyId: "agent_policy_c136_p",
    policyVersion: "policy_c136_p_v1",
    policyHash: hash("a")
  },
  authority: {
    workspaceIdentityHash: hash("3"),
    mountGeneration: "mount_c136_p",
    ledgerStoreIdentity: "ledger_c136_p",
    artifactStoreIdentity: "artifact_c136_p",
    ledgerHighWaterEventId: "evt_source_002",
    policyHash: hash("a"),
    activeLocksHash: hash("b")
  },
  sourceEventIds: ["evt_source_001", "evt_source_002"],
  contextPackRefs: [{ contextPackId: "context_pack_c136_p", contentHash: hash("4") }],
  budget: budget(0, 0, 0),
  causationId: "evt_admission_c136_p",
  correlationId: "corr_c136_p",
  planId: "plan_c136_p_initial",
  planRevision: 0,
  priorPlanReadback: null,
  replanObservationReadback: null,
  steps: [{
    ordinal: 1,
    purpose: "Inspect mounted evidence.",
    toolId: "tool_read_workspace",
    toolVersion: "1.0.0",
    allowlistEntryHash: hash("f"),
    expectedSafeOutputClass: "observation",
    prerequisiteStepOrdinals: []
  }, {
    ordinal: 2,
    purpose: "Build a reviewable local derivative.",
    toolId: "tool_build_derivative",
    toolVersion: "1.0.0",
    allowlistEntryHash: hash("1"),
    expectedSafeOutputClass: "derivative",
    prerequisiteStepOrdinals: [1]
  }]
});

const priorPlanReadback = deepFreeze({
  planRecordEventId: "evt_plan_c136_p_initial",
  workspaceId: initialPlan.workspaceId,
  residentAgentId: initialPlan.residentAgentId,
  taskId: initialPlan.taskId,
  attemptId: initialPlan.attemptId,
  runId: initialPlan.runId,
  planId: initialPlan.planId,
  planRevision: initialPlan.planRevision
});

const observation = deepFreeze({
  observationEventId: "evt_observation_c136_p_initial",
  workspaceId: initialPlan.workspaceId,
  residentAgentId: initialPlan.residentAgentId,
  taskId: initialPlan.taskId,
  attemptId: initialPlan.attemptId,
  runId: initialPlan.runId,
  planId: initialPlan.planId,
  planRevision: initialPlan.planRevision
});

const replan = deepFreeze({
  ...initialPlan,
  planId: "plan_c136_p_replan",
  planRevision: 1,
  priorPlanReadback: { ...priorPlanReadback, priorPlanRecordEventId: priorPlanReadback.planRecordEventId },
  replanObservationReadback: observation,
  budget: budget(1, 1, 1),
  steps: [initialPlan.steps[0]]
});

describe("resident plan candidate provider", () => {
  it("returns deeply frozen initial and replan candidates with the exact Task120 and P2 bindings", async () => {
    const provider = (await candidateApi()).createResidentPlanCandidateProvider();
    const initial = await provider.createInitialCandidate(deepFreeze({
      plan: initialPlan,
      providerPosture: posture,
      policyConstraints: constraints
    }));
    const revised = await provider.createReplanCandidate(deepFreeze({
      plan: replan,
      providerPosture: posture,
      policyConstraints: constraints,
      priorPlanReadback,
      replanObservationReadback: observation
    }));

    expect(initial).toMatchObject({
      schemaVersion: "resident-initial-plan-candidate.v1",
      plan: initialPlan,
      providerPosture: posture,
      policyConstraints: constraints
    });
    expect(revised).toMatchObject({
      schemaVersion: "resident-replan-candidate.v1",
      plan: replan,
      providerPosture: posture,
      policyConstraints: constraints
    });
    expect(deeplyFrozen(initial)).toBe(true);
    expect(deeplyFrozen(revised)).toBe(true);
  });

  it("rejects mutable, hostile, secret-bearing, stale, or mismatched candidate/posture data before producing output", async () => {
    const provider = (await candidateApi()).createResidentPlanCandidateProvider();
    let getterCalls = 0;
    const accessor = Object.create(Object.prototype, {
      plan: { enumerable: true, get: () => { getterCalls += 1; return initialPlan; } },
      providerPosture: { enumerable: true, value: posture },
      policyConstraints: { enumerable: true, value: constraints }
    });
    const proxy = new Proxy({ plan: initialPlan, providerPosture: posture, policyConstraints: constraints }, {});
    const mutable = { plan: initialPlan, providerPosture: posture, policyConstraints: constraints };
    const secretPlan = deepFreeze({ ...initialPlan, steps: [{ ...initialPlan.steps[0], purpose: "authorization: bearer abcdefghijkl" }] });
    const hostPlan = deepFreeze({ ...initialPlan, steps: [{ ...initialPlan.steps[0], purpose: "Fetch https://example.test evidence." }] });
    const stalePosture = deepFreeze({ ...posture, run: { ...posture.run, runId: "run_other" } });

    await expect(provider.createInitialCandidate(accessor)).rejects.toThrow(/plan candidate/i);
    await expect(provider.createInitialCandidate(proxy)).rejects.toThrow(/plan candidate/i);
    await expect(provider.createInitialCandidate(mutable)).rejects.toThrow(/plan candidate/i);
    await expect(provider.createInitialCandidate(deepFreeze({ plan: secretPlan, providerPosture: posture, policyConstraints: constraints }))).rejects.toThrow(/plan candidate/i);
    await expect(provider.createInitialCandidate(deepFreeze({ plan: hostPlan, providerPosture: posture, policyConstraints: constraints }))).rejects.toThrow(/plan candidate/i);
    await expect(provider.createInitialCandidate(deepFreeze({ plan: initialPlan, providerPosture: stalePosture, policyConstraints: constraints }))).rejects.toThrow(/plan candidate/i);
    expect(getterCalls).toBe(0);
  });

  it("rejects invalid steps and every wider or substituted replan before it can become a candidate", async () => {
    const provider = (await candidateApi()).createResidentPlanCandidateProvider();
    const base = deepFreeze({
      plan: replan,
      providerPosture: posture,
      policyConstraints: constraints,
      priorPlanReadback,
      replanObservationReadback: observation
    });
    const invalidSteps = deepFreeze({ ...replan, steps: [{ ...replan.steps[0], ordinal: 2, prerequisiteStepOrdinals: [2] }] });
    const widenedTool = deepFreeze({ ...replan, steps: [{ ...replan.steps[0], toolVersion: "2.0.0" }] });
    const widenedOutput = deepFreeze({ ...replan, steps: [{ ...replan.steps[0], expectedSafeOutputClass: "proposal" }] });
    const widenedSource = deepFreeze({ ...replan, sourceEventIds: ["evt_source_001", "evt_source_002", "evt_source_003"] });
    const widenedBudget = deepFreeze({ ...replan, budget: { ...replan.budget, ceilings: { ...replan.budget.ceilings, toolSteps: 13 } } });
    const widerApproval = deepFreeze({ ...constraints, requiredApprovalClasses: [...constraints.requiredApprovalClasses, "external-message-send"] });
    const changedModel = deepFreeze({ ...posture, selection: { ...posture.selection, modelId: "model_other" } });

    await expect(provider.createReplanCandidate(deepFreeze({ ...base, plan: invalidSteps }))).rejects.toThrow(/plan candidate/i);
    await expect(provider.createReplanCandidate(deepFreeze({ ...base, plan: widenedTool }))).rejects.toThrow(/plan candidate/i);
    await expect(provider.createReplanCandidate(deepFreeze({ ...base, plan: widenedOutput }))).rejects.toThrow(/plan candidate/i);
    await expect(provider.createReplanCandidate(deepFreeze({ ...base, plan: widenedSource }))).rejects.toThrow(/plan candidate/i);
    await expect(provider.createReplanCandidate(deepFreeze({ ...base, plan: widenedBudget }))).rejects.toThrow(/plan candidate/i);
    await expect(provider.createReplanCandidate(deepFreeze({ ...base, policyConstraints: widerApproval }))).rejects.toThrow(/plan candidate/i);
    await expect(provider.createReplanCandidate(deepFreeze({ ...base, providerPosture: changedModel }))).rejects.toThrow(/plan candidate/i);
  });
});

async function candidateApi(): Promise<ResidentPlanCandidateProviderApi> {
  const modulePath = ["..", "src", "resident-plan-candidate-provider.js"].join("/");
  const imported: unknown = await import(modulePath).catch(() => undefined);
  expect(isCandidateProviderApi(imported)).toBe(true);
  if (!isCandidateProviderApi(imported)) throw new Error("resident plan candidate provider API is unavailable");
  return imported;
}

function isCandidateProviderApi(value: unknown): value is ResidentPlanCandidateProviderApi {
  return value !== null && typeof value === "object" &&
    typeof Reflect.get(value, "createResidentPlanCandidateProvider") === "function";
}

function budget(planRevisions: number, observationRecords: number, actionPlanRevisions: number) {
  const ceilings = {
    planRevisions: 3,
    observationRecords: 16,
    toolSteps: 12,
    providerInvocations: 3,
    providerRequestBytes: 1048576,
    providerResponseBytes: 1048576,
    contextBytes: 1048576,
    derivativeArtifactBytes: 16777216,
    activeExecutionMs: 900000,
    approvalSuspensionMs: 86400000
  };
  const consumed = {
    planRevisions,
    observationRecords,
    toolSteps: 0,
    providerInvocations: 0,
    providerRequestBytes: 0,
    providerResponseBytes: 0,
    contextBytes: 0,
    derivativeArtifactBytes: 0,
    activeExecutionMs: 0,
    approvalSuspensionMs: 0
  };
  return {
    ceilings,
    consumed,
    remaining: Object.fromEntries(Object.entries(ceilings).map(([key, value]) => [key, value - consumed[key as keyof typeof consumed]])),
    actionConsumption: { ...consumed, planRevisions: actionPlanRevisions, observationRecords: 0 }
  };
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const key of Reflect.ownKeys(value)) deepFreeze(Reflect.get(value, key));
    Object.freeze(value);
  }
  return value;
}

function deeplyFrozen(value: unknown): boolean {
  if (value === null || typeof value !== "object" || !Object.isFrozen(value)) return false;
  return Reflect.ownKeys(value).every((key) => deeplyFrozen(Reflect.get(value, key)));
}
