import {
  validateKnowledgeEvent,
  validateResidentLoopEventSequence
} from "../../ontology/src/contracts.js";
import { describe, expect, it } from "vitest";

interface ResidentPlanCandidateProvider {
  createInitialCandidate(input: unknown): Promise<unknown>;
  createReplanCandidate(input: unknown): Promise<unknown>;
}

interface ResidentPlanCandidateProviderModule {
  createResidentPlanCandidateProvider(): ResidentPlanCandidateProvider;
  parseResidentUntrustedPlanCandidate?: (input: unknown) => unknown;
}

const hash = (character: string) => `sha256:${character.repeat(64)}`;
const attemptId = `attempt_${"a".repeat(64)}`;

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
    attemptId,
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
    sourceEventIds: [
      "evt_capability_c136_p",
      "evt_credential_c136_p",
      "evt_endpoint_policy_c136_p"
    ]
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

const budgetCeilings = deepFreeze({
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
});

const initialAction = budgetUsage({ contextBytes: 512 });
const initialConsumed = initialAction;
const observationAction = budgetUsage({
  observationRecords: 1,
  providerInvocations: 1,
  providerRequestBytes: 128,
  providerResponseBytes: 256
});
const observationConsumed = addBudgetUsage(initialConsumed, observationAction);
const replanAction = budgetUsage({ planRevisions: 1 });
const replanConsumed = addBudgetUsage(observationConsumed, replanAction);

const initialPlan = deepFreeze({
  schemaVersion: "resident-plan-record.v2",
  residentAgentId: "agent_default",
  workspaceId: "ws_c136_p",
  taskId: "task_c136_p",
  attemptId,
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
  contextPackRefs: [{
    contextPackId: "context_pack_c136_p",
    contentHash: hash("4")
  }],
  budget: budgetSnapshot(initialConsumed, initialAction),
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

const streamId =
  `agent_resident_loop_task_c136_p_${attemptId}_run_c136_p`;
const priorPlanEventId = "evt_plan_c136_p_initial";
const observationEventId = "evt_observation_c136_p_initial";
const eventContext = deepFreeze({
  actor: {
    id: "agent_default",
    kind: "agent",
    label: "Cestus Resident Agent"
  },
  occurredAt: "2026-07-19T00:00:00.000Z",
  causationId: initialPlan.causationId,
  correlationId: initialPlan.correlationId,
  coreVersion: "0.1.0",
  packVersions: {
    core: "0.1.0",
    agent: "0.1.0"
  }
});

const priorPlanReadback = deepFreeze({
  planRecordEventId: priorPlanEventId,
  workspaceId: initialPlan.workspaceId,
  residentAgentId: initialPlan.residentAgentId,
  taskId: initialPlan.taskId,
  attemptId: initialPlan.attemptId,
  runId: initialPlan.runId,
  planId: initialPlan.planId,
  planRevision: initialPlan.planRevision
});

const boundPriorPlanPayload = deepFreeze({
  ...initialPlan,
  steps: initialPlan.steps.map((step, index) => ({
    ...step,
    toolRequestId: `toolreq_c136_p_${index + 1}`,
    executionCapabilityHash: hash("5")
  }))
});

const priorPlan = deepFreeze({
  id: priorPlanEventId,
  type: "agent.resident-plan.recorded.v2",
  version: 1,
  streamId,
  sequence: 1,
  context: eventContext,
  payload: boundPriorPlanPayload
});

const observationReadback = deepFreeze({
  observationEventId,
  workspaceId: initialPlan.workspaceId,
  residentAgentId: initialPlan.residentAgentId,
  taskId: initialPlan.taskId,
  attemptId: initialPlan.attemptId,
  runId: initialPlan.runId,
  planId: initialPlan.planId,
  planRevision: initialPlan.planRevision
});

const observation = deepFreeze({
  id: observationEventId,
  type: "agent.resident-observation.recorded.v2",
  version: 1,
  streamId,
  sequence: 2,
  context: {
    ...eventContext,
    causationId: priorPlanEventId
  },
  payload: {
    residentAgentId: initialPlan.residentAgentId,
    workspaceId: initialPlan.workspaceId,
    taskId: initialPlan.taskId,
    attemptId: initialPlan.attemptId,
    runId: initialPlan.runId,
    runMode: initialPlan.runMode,
    workflowDescriptor: initialPlan.workflowDescriptor,
    policy: initialPlan.policy,
    authority: initialPlan.authority,
    sourceEventIds: initialPlan.sourceEventIds,
    contextPackRefs: initialPlan.contextPackRefs,
    budget: budgetSnapshot(observationConsumed, observationAction),
    causationId: priorPlanEventId,
    correlationId: initialPlan.correlationId,
    schemaVersion: "resident-observation-record.v2",
    observationId: "observation_c136_p_initial",
    planId: initialPlan.planId,
    planRevision: initialPlan.planRevision,
    planReadback: priorPlanReadback,
    stepOrdinal: 1,
    kind: "provider-result",
    safeSummary: "Copied durable replay observation.",
    artifactHashes: [hash("4")],
    toolRequestId: "toolreq_c136_p_1",
    modelInvocationEventId: "evt_invocation_c136_p"
  }
});

const durableReplay = deepFreeze({
  identity: {
    residentAgentId: initialPlan.residentAgentId,
    workspaceId: initialPlan.workspaceId,
    taskId: initialPlan.taskId,
    attemptId: initialPlan.attemptId,
    runId: initialPlan.runId
  },
  events: [priorPlan, observation],
  plans: [priorPlan],
  observations: [observation],
  toolSteps: [],
  suspensions: [],
  results: []
});

const replan = deepFreeze({
  ...initialPlan,
  planId: "plan_c136_p_replan",
  planRevision: 1,
  priorPlanReadback: {
    ...priorPlanReadback,
    priorPlanRecordEventId: priorPlanReadback.planRecordEventId
  },
  replanObservationReadback: observationReadback,
  budget: budgetSnapshot(replanConsumed, replanAction),
  causationId: observationEventId,
  steps: [initialPlan.steps[0]]
});

const initialCandidate = deepFreeze({
  kind: "initial",
  proposedPlan: initialPlan,
  providerPosture: posture,
  policyConstraints: constraints
});

const replanCandidate = deepFreeze({
  kind: "replan",
  priorPlan,
  priorPlanReadback: durableReplay,
  replanObservationReadback: observation,
  proposedPlan: replan
});

describe("resident plan candidate provider", () => {
  it("returns deeply frozen exact initial and replan candidates through the sole parser boundary", async () => {
    const priorValidation = validateKnowledgeEvent(priorPlan);
    const observationValidation = validateKnowledgeEvent(observation);
    expect(priorValidation.success, JSON.stringify(priorValidation)).toBe(true);
    expect(observationValidation.success, JSON.stringify(observationValidation)).toBe(true);
    if (!priorValidation.success || !observationValidation.success) {
      throw new Error("canonical resident replay fixture is unavailable");
    }
    const replayValidation = validateResidentLoopEventSequence([
      priorValidation.data,
      observationValidation.data
    ]);
    expect(replayValidation.success, JSON.stringify(replayValidation)).toBe(true);
    expect(Object.keys(durableReplay)).toEqual([
      "identity",
      "events",
      "plans",
      "observations",
      "toolSteps",
      "suspensions",
      "results"
    ]);
    expect(Object.keys(initialPlan.steps[0]!)).toEqual([
      "ordinal",
      "purpose",
      "toolId",
      "toolVersion",
      "allowlistEntryHash",
      "expectedSafeOutputClass",
      "prerequisiteStepOrdinals"
    ]);
    expect(Object.keys(boundPriorPlanPayload.steps[0]!)).toEqual([
      ...Object.keys(initialPlan.steps[0]!),
      "toolRequestId",
      "executionCapabilityHash"
    ]);

    const module = await candidateApi();
    const provider = module.createResidentPlanCandidateProvider();
    const initial = await createAndParseInitial(module, provider, initialInput());
    const revised = await createAndParseReplan(module, provider, replanInput());

    expect(initial).toEqual(initialCandidate);
    expect(revised).toEqual(replanCandidate);
    expect(deeplyFrozen(initial)).toBe(true);
    expect(deeplyFrozen(revised)).toBe(true);
  });

  it("makes parseResidentUntrustedPlanCandidate the only exact structural candidate boundary", async () => {
    const module = await candidateApi();
    const parsedInitial = parseCandidate(module, initialCandidate);
    const parsedReplan = parseCandidate(module, replanCandidate);
    expect(parsedInitial).toEqual(initialCandidate);
    expect(parsedReplan).toEqual(replanCandidate);
    expect(deeplyFrozen(parsedInitial)).toBe(true);
    expect(deeplyFrozen(parsedReplan)).toBe(true);

    let getterCalls = 0;
    const accessor = Object.create(Object.prototype, {
      kind: {
        enumerable: true,
        get: () => {
          getterCalls += 1;
          return "initial";
        }
      },
      proposedPlan: { enumerable: true, value: initialPlan },
      providerPosture: { enumerable: true, value: posture },
      policyConstraints: { enumerable: true, value: constraints }
    });
    expect(() => parseCandidate(module, accessor)).toThrow(/candidate/i);
    expect(() => parseCandidate(module, {
      ...initialCandidate,
      compatibilityPlan: initialPlan
    })).toThrow(/candidate/i);
    expect(() => parseCandidate(module, {
      schemaVersion: "resident-initial-plan-candidate.v1",
      plan: initialPlan,
      providerPosture: posture,
      policyConstraints: constraints
    })).toThrow(/candidate/i);
    expect(getterCalls).toBe(0);
  });

  it("rejects mutable, hostile, secret-bearing, stale, or mismatched initial data before producing output", async () => {
    const module = await candidateApi();
    const provider = module.createResidentPlanCandidateProvider();
    await createAndParseInitial(module, provider, initialInput());

    let getterCalls = 0;
    const accessor = Object.create(Object.prototype, {
      proposedPlan: {
        enumerable: true,
        get: () => {
          getterCalls += 1;
          return initialPlan;
        }
      },
      providerPosture: { enumerable: true, value: posture },
      policyConstraints: { enumerable: true, value: constraints }
    });
    const proxy = new Proxy({
      proposedPlan: initialPlan,
      providerPosture: posture,
      policyConstraints: constraints
    }, {});
    const mutable = {
      proposedPlan: initialPlan,
      providerPosture: posture,
      policyConstraints: constraints
    };
    const secretPlan = deepFreeze({
      ...initialPlan,
      steps: [{
        ...initialPlan.steps[0],
        purpose: "authorization material must never enter a candidate"
      }]
    });
    const hostPlan = deepFreeze({
      ...initialPlan,
      steps: [{
        ...initialPlan.steps[0],
        purpose: "Fetch https://example.test evidence."
      }]
    });
    const stalePosture = deepFreeze({
      ...posture,
      run: {
        ...posture.run,
        runId: "run_other"
      }
    });

    await expect(provider.createInitialCandidate(accessor)).rejects.toThrow(/candidate/i);
    await expect(provider.createInitialCandidate(proxy)).rejects.toThrow(/candidate/i);
    await expect(provider.createInitialCandidate(mutable)).rejects.toThrow(/candidate/i);
    await expect(provider.createInitialCandidate(initialInput(secretPlan))).rejects.toThrow(/candidate/i);
    await expect(provider.createInitialCandidate(initialInput(hostPlan))).rejects.toThrow(/candidate/i);
    await expect(provider.createInitialCandidate(initialInput(initialPlan, stalePosture))).rejects.toThrow(/candidate/i);
    expect(getterCalls).toBe(0);
  });

  it("rejects invalid steps and every wider or substituted replan using only durable facts", async () => {
    const module = await candidateApi();
    await createAndParseReplan(
      module,
      module.createResidentPlanCandidateProvider(),
      replanInput()
    );

    const invalidSteps = deepFreeze({
      ...replan,
      steps: [{
        ...replan.steps[0],
        ordinal: 2,
        prerequisiteStepOrdinals: [2]
      }]
    });
    const widenedTool = deepFreeze({
      ...replan,
      steps: [{
        ...replan.steps[0],
        toolVersion: "2.0.0"
      }]
    });
    const widenedOutput = deepFreeze({
      ...replan,
      steps: [{
        ...replan.steps[0],
        expectedSafeOutputClass: "proposal"
      }]
    });
    const widerSources = deepFreeze({
      ...replan,
      sourceEventIds: [
        ...replan.sourceEventIds,
        "evt_source_003"
      ],
      authority: {
        ...replan.authority,
        ledgerHighWaterEventId: "evt_source_003"
      }
    });
    const substitutedContext = deepFreeze({
      ...replan,
      contextPackRefs: [{
        contextPackId: "context_pack_other",
        contentHash: hash("6")
      }]
    });
    const jumpedBudget = deepFreeze({
      ...replan,
      budget: budgetSnapshot(
        addBudgetUsage(replanConsumed, budgetUsage({ contextBytes: 1 })),
        replanAction
      )
    });
    const substitutedPolicy = deepFreeze({
      ...replan,
      policy: {
        ...replan.policy,
        policyVersion: "policy_c136_p_v2"
      }
    });
    const substitutedAuthority = deepFreeze({
      ...replan,
      authority: {
        ...replan.authority,
        activeLocksHash: hash("6")
      }
    });

    for (const [label, proposedPlan] of [
      ["invalid step graph", invalidSteps],
      ["wider tool version", widenedTool],
      ["wider output class", widenedOutput],
      ["wider source set", widerSources],
      ["substituted context", substitutedContext],
      ["unaccounted budget jump", jumpedBudget],
      ["substituted policy", substitutedPolicy],
      ["substituted authority", substitutedAuthority]
    ] as const) {
      await expect(
        module.createResidentPlanCandidateProvider().createReplanCandidate(
          replanInput(proposedPlan)
        ),
        label
      ).rejects.toThrow(/candidate/i);
    }
  });

  it("rejects a numeric runMode", async () => {
    const module = await candidateApi();
    const provider = module.createResidentPlanCandidateProvider();
    await createAndParseInitial(module, provider, initialInput());
    const numericRunMode = deepFreeze({
      ...initialPlan,
      runMode: 7
    });

    await expect(provider.createInitialCandidate(
      initialInput(numericRunMode)
    )).rejects.toThrow(/candidate/i);
  });

  it("rejects a runMode outside the released enum", async () => {
    const module = await candidateApi();
    const provider = module.createResidentPlanCandidateProvider();
    await createAndParseInitial(module, provider, initialInput());
    const unknownRunMode = deepFreeze({
      ...initialPlan,
      runMode: "unreleased-mode"
    });

    await expect(provider.createInitialCandidate(
      initialInput(unknownRunMode)
    )).rejects.toThrow(/candidate/i);
  });

  it("rejects a numeric correlationId", async () => {
    const module = await candidateApi();
    const provider = module.createResidentPlanCandidateProvider();
    await createAndParseInitial(module, provider, initialInput());
    const numericCorrelation = deepFreeze({
      ...initialPlan,
      correlationId: 42
    });

    await expect(provider.createInitialCandidate(
      initialInput(numericCorrelation)
    )).rejects.toThrow(/candidate/i);
  });

  it("rejects a scalar plan slot substituted with nested URL, DNS, IP, or localhost material", async () => {
    const module = await candidateApi();
    const provider = module.createResidentPlanCandidateProvider();
    await createAndParseInitial(module, provider, initialInput());
    const hostilePlanScalar = deepFreeze({
      ...initialPlan,
      correlationId: {
        material: "https://api.x/path localhost 127.0.0.1"
      }
    });

    await expect(provider.createInitialCandidate(
      initialInput(hostilePlanScalar)
    )).rejects.toThrow(/candidate/i);
  });

  it("rejects a scalar provider-posture slot substituted with nested authorization material", async () => {
    const module = await candidateApi();
    const provider = module.createResidentPlanCandidateProvider();
    await createAndParseInitial(module, provider, initialInput());
    const hostilePostureScalar = deepFreeze({
      ...posture,
      selection: {
        ...posture.selection,
        modelId: {
          headers: {
            Authorization: "unsafe review material"
          }
        }
      }
    });

    await expect(provider.createInitialCandidate(
      initialInput(initialPlan, hostilePostureScalar)
    )).rejects.toThrow(/candidate/i);
  });

  it("requires the exact Task139-P2 provider-byte-transfer approval class", async () => {
    const module = await candidateApi();
    const provider = module.createResidentPlanCandidateProvider();
    await createAndParseInitial(module, provider, initialInput());
    const substitutedApproval = deepFreeze({
      ...posture,
      approval: {
        ...posture.approval,
        requiredApprovalClass: "none"
      }
    });

    await expect(provider.createInitialCandidate(
      initialInput(initialPlan, substitutedApproval)
    )).rejects.toThrow(/candidate/i);
  });

  it("rejects a replan whose policy and authority diverge from the durable prior event", async () => {
    const module = await candidateApi();
    await createAndParseReplan(
      module,
      module.createResidentPlanCandidateProvider(),
      replanInput()
    );
    const changedPolicy = deepFreeze({
      ...replan,
      policy: {
        ...replan.policy,
        policyId: "agent_policy_other"
      }
    });
    const changedAuthority = deepFreeze({
      ...replan,
      authority: {
        ...replan.authority,
        ledgerStoreIdentity: "ledger_other"
      }
    });

    await expect(module.createResidentPlanCandidateProvider().createReplanCandidate(
      replanInput(changedPolicy)
    )).rejects.toThrow(/candidate/i);
    await expect(module.createResidentPlanCandidateProvider().createReplanCandidate(
      replanInput(changedAuthority)
    )).rejects.toThrow(/candidate/i);
  });

  it("rejects a replan whose consumed and remaining budget jump beyond actionConsumption", async () => {
    const module = await candidateApi();
    await createAndParseReplan(
      module,
      module.createResidentPlanCandidateProvider(),
      replanInput()
    );
    const jumpedBudget = deepFreeze({
      ...replan,
      budget: budgetSnapshot(
        addBudgetUsage(replanConsumed, budgetUsage({ observationRecords: 1 })),
        replanAction
      )
    });

    await expect(module.createResidentPlanCandidateProvider().createReplanCandidate(
      replanInput(jumpedBudget)
    )).rejects.toThrow(/candidate/i);
  });

  it("rejects provider-byte-transfer as an initial automatic action class", async () => {
    const module = await candidateApi();
    const provider = module.createResidentPlanCandidateProvider();
    await createAndParseInitial(module, provider, initialInput());
    const automaticProviderTransfer = deepFreeze({
      ...constraints,
      permittedAutomaticActionClasses: [
        ...constraints.permittedAutomaticActionClasses,
        "provider-byte-transfer"
      ]
    });

    await expect(provider.createInitialCandidate(
      initialInput(initialPlan, posture, automaticProviderTransfer)
    )).rejects.toThrow(/candidate/i);
  });

  it("rejects a non-canonical feasibility assessment timestamp", async () => {
    const module = await candidateApi();
    const provider = module.createResidentPlanCandidateProvider();
    await createAndParseInitial(module, provider, initialInput());
    const nonCanonicalTimestamp = deepFreeze({
      ...posture,
      feasibility: {
        ...posture.feasibility,
        assessedAt: "July 19, 2026 00:00 UTC"
      }
    });

    await expect(provider.createInitialCandidate(
      initialInput(initialPlan, nonCanonicalTimestamp)
    )).rejects.toThrow(/candidate/i);
  });

  it("rejects IDNA-dot IP material in a correlationId after WHATWG-equivalent normalization", async () => {
    const module = await candidateApi();
    const provider = module.createResidentPlanCandidateProvider();
    await createAndParseInitial(module, provider, initialInput());
    const idnaDotIp = deepFreeze({
      ...initialPlan,
      correlationId: "127。0。0。1"
    });

    await expect(provider.createInitialCandidate(
      initialInput(idnaDotIp)
    )).rejects.toThrow(/candidate/i);
  });

  it("rejects full-width IDNA-dot IP material in a correlationId after WHATWG-equivalent normalization", async () => {
    const module = await candidateApi();
    const provider = module.createResidentPlanCandidateProvider();
    await createAndParseInitial(module, provider, initialInput());
    const fullWidthIp = deepFreeze({
      ...initialPlan,
      correlationId: "１２７。０。０。１"
    });

    await expect(provider.createInitialCandidate(
      initialInput(fullWidthIp)
    )).rejects.toThrow(/candidate/i);
  });

  it("rejects an external-byte-transfer allowlist entry paired with none approval", async () => {
    const module = await candidateApi();
    const provider = module.createResidentPlanCandidateProvider();
    await createAndParseInitial(module, provider, initialInput());
    const weakExternalTransfer = deepFreeze({
      ...constraints,
      toolAllowlist: [{
        ...constraints.toolAllowlist[0],
        sideEffectClass: "external-byte-transfer",
        requiredApprovalClass: "none"
      }, constraints.toolAllowlist[1]]
    });

    await expect(provider.createInitialCandidate(
      initialInput(initialPlan, posture, weakExternalTransfer)
    )).rejects.toThrow(/candidate/i);
  });

  it("rejects a stale authority and posture high-water behind ordered sources", async () => {
    const module = await candidateApi();
    const provider = module.createResidentPlanCandidateProvider();
    await createAndParseInitial(module, provider, initialInput());
    const stalePlan = deepFreeze({
      ...initialPlan,
      authority: {
        ...initialPlan.authority,
        ledgerHighWaterEventId: "evt_source_001"
      }
    });
    const stalePosture = deepFreeze({
      ...posture,
      workspace: {
        ...posture.workspace,
        highWaterMark: "evt_source_001"
      }
    });

    await expect(provider.createInitialCandidate(
      initialInput(stalePlan, stalePosture)
    )).rejects.toThrow(/candidate/i);
  });

  it("rejects ordered sources newer than bound authority high-water", async () => {
    const module = await candidateApi();
    const provider = module.createResidentPlanCandidateProvider();
    await createAndParseInitial(module, provider, initialInput());
    const newerSources = deepFreeze({
      ...initialPlan,
      sourceEventIds: [
        "evt_source_001",
        "evt_source_002",
        "evt_source_003"
      ]
    });

    await expect(provider.createInitialCandidate(
      initialInput(newerSources)
    )).rejects.toThrow(/candidate/i);
  });

  it("requires every allowlist approval class globally", async () => {
    const module = await candidateApi();
    const provider = module.createResidentPlanCandidateProvider();
    await createAndParseInitial(module, provider, initialInput());
    const external = deepFreeze({
      ...constraints,
      toolAllowlist: [{
        ...constraints.toolAllowlist[0],
        sideEffectClass: "external-message-send",
        requiredApprovalClass: "external-message-send"
      }, constraints.toolAllowlist[1]]
    });

    await expect(provider.createInitialCandidate(
      initialInput(initialPlan, posture, external)
    )).rejects.toThrow(/candidate/i);
  });

  it("rejects an initial plan record with zero action consumption", async () => {
    const module = await candidateApi();
    const provider = module.createResidentPlanCandidateProvider();
    await createAndParseInitial(module, provider, initialInput());
    const zeroActionInitial = deepFreeze({
      ...initialPlan,
      budget: budgetSnapshot(budgetUsage(), budgetUsage())
    });

    await expect(provider.createInitialCandidate(
      initialInput(zeroActionInitial)
    )).rejects.toThrow(/candidate/i);
  });

  it("rejects an initial budget whose consumed totals do not match its action", async () => {
    const module = await candidateApi();
    const provider = module.createResidentPlanCandidateProvider();
    await createAndParseInitial(module, provider, initialInput());
    const mismatchedInitial = deepFreeze({
      ...initialPlan,
      budget: budgetSnapshot(
        budgetUsage({ contextBytes: 512 }),
        budgetUsage({ contextBytes: 256 })
      )
    });

    await expect(provider.createInitialCandidate(
      initialInput(mismatchedInitial)
    )).rejects.toThrow(/candidate/i);
  });

  it("creates repeated initial candidates without process-local state or hidden binding", async () => {
    const module = await candidateApi();
    const provider = module.createResidentPlanCandidateProvider();
    const first = await createAndParseInitial(module, provider, initialInput());
    const repeated = await createAndParseInitial(module, provider, initialInput());
    const secondPlan = deepFreeze({
      ...initialPlan,
      planId: "plan_c136_p_second"
    });
    const second = await createAndParseInitial(
      module,
      provider,
      initialInput(secondPlan)
    );
    const restarted = await createAndParseInitial(
      module,
      module.createResidentPlanCandidateProvider(),
      initialInput(secondPlan)
    );

    expect(first).toEqual(initialCandidate);
    expect(repeated).toEqual(initialCandidate);
    expect(repeated).not.toBe(first);
    expect(second).toEqual({
      ...initialCandidate,
      proposedPlan: secondPlan
    });
    expect(restarted).toEqual(second);
  });

  it("rejects an unreleased global approval class", async () => {
    const module = await candidateApi();
    const provider = module.createResidentPlanCandidateProvider();
    await createAndParseInitial(module, provider, initialInput());
    const unreleasedApproval = deepFreeze({
      ...constraints,
      requiredApprovalClasses: [
        ...constraints.requiredApprovalClasses,
        "unreleased-approval"
      ]
    });

    await expect(provider.createInitialCandidate(
      initialInput(initialPlan, posture, unreleasedApproval)
    )).rejects.toThrow(/candidate/i);
  });

  it("replans from copied durable replay with no latest-process cache", async () => {
    const module = await candidateApi();
    const freshProvider = module.createResidentPlanCandidateProvider();
    const candidate = await createAndParseReplan(
      module,
      freshProvider,
      replanInput()
    );
    expect(candidate).toEqual(replanCandidate);

    const mutations = [
      ["policy version", {
        ...replan,
        policy: {
          ...replan.policy,
          policyVersion: "policy_c136_p_v2"
        }
      }],
      ["authority source", {
        ...replan,
        authority: {
          ...replan.authority,
          ledgerStoreIdentity: "ledger_other"
        }
      }],
      ["wider tool version", {
        ...replan,
        steps: [{
          ...replan.steps[0],
          toolVersion: "2.0.0"
        }]
      }],
      ["wider output class", {
        ...replan,
        steps: [{
          ...replan.steps[0],
          expectedSafeOutputClass: "proposal"
        }]
      }],
      ["wider source set", {
        ...replan,
        sourceEventIds: [
          ...replan.sourceEventIds,
          "evt_source_003"
        ],
        authority: {
          ...replan.authority,
          ledgerHighWaterEventId: "evt_source_003"
        }
      }],
      ["substituted context set", {
        ...replan,
        contextPackRefs: [{
          contextPackId: "context_pack_other",
          contentHash: hash("6")
        }]
      }],
      ["unaccounted budget", {
        ...replan,
        budget: budgetSnapshot(
          addBudgetUsage(replanConsumed, budgetUsage({ toolSteps: 1 })),
          replanAction
        )
      }]
    ] as const;

    for (const [label, proposedPlan] of mutations) {
      await expect(
        module.createResidentPlanCandidateProvider().createReplanCandidate(
          replanInput(deepFreeze(proposedPlan))
        ),
        label
      ).rejects.toThrow(/candidate/i);
    }

    const replayWithSubstitutedObservation = deepFreeze({
      ...durableReplay,
      observations: [deepFreeze({
        ...observation,
        id: "evt_observation_other"
      })]
    });
    await expect(
      module.createResidentPlanCandidateProvider().createReplanCandidate(
        replanInput(replan, priorPlan, replayWithSubstitutedObservation, observation)
      )
    ).rejects.toThrow(/candidate/i);
  });
});

function initialInput(
  proposedPlan: unknown = initialPlan,
  providerPosture: unknown = posture,
  policyConstraints: unknown = constraints
): unknown {
  return deepFreeze({
    proposedPlan,
    providerPosture,
    policyConstraints
  });
}

function replanInput(
  proposedPlan: unknown = replan,
  durablePrior: unknown = priorPlan,
  priorReplay: unknown = durableReplay,
  durableObservation: unknown = observation
): unknown {
  return deepFreeze({
    priorPlan: durablePrior,
    priorPlanReadback: priorReplay,
    replanObservationReadback: durableObservation,
    proposedPlan
  });
}

async function createAndParseInitial(
  module: ResidentPlanCandidateProviderModule,
  provider: ResidentPlanCandidateProvider,
  input: unknown
): Promise<unknown> {
  return parseCandidate(module, await provider.createInitialCandidate(input));
}

async function createAndParseReplan(
  module: ResidentPlanCandidateProviderModule,
  provider: ResidentPlanCandidateProvider,
  input: unknown
): Promise<unknown> {
  return parseCandidate(module, await provider.createReplanCandidate(input));
}

function parseCandidate(
  module: ResidentPlanCandidateProviderModule,
  input: unknown
): unknown {
  const parser = Reflect.get(module, "parseResidentUntrustedPlanCandidate");
  expect(typeof parser).toBe("function");
  if (typeof parser !== "function") {
    throw new Error("resident untrusted plan candidate parser is unavailable");
  }
  return Reflect.apply(parser, undefined, [input]);
}

async function candidateApi(): Promise<ResidentPlanCandidateProviderModule> {
  const modulePath = [
    "..",
    "src",
    "resident-plan-candidate-provider.js"
  ].join("/");
  const imported: unknown = await import(modulePath).catch(() => undefined);
  expect(isCandidateProviderApi(imported)).toBe(true);
  if (!isCandidateProviderApi(imported)) {
    throw new Error("resident plan candidate provider API is unavailable");
  }
  return imported;
}

function isCandidateProviderApi(
  value: unknown
): value is ResidentPlanCandidateProviderModule {
  return value !== null &&
    typeof value === "object" &&
    typeof Reflect.get(value, "createResidentPlanCandidateProvider") === "function";
}

type BudgetUsage = Record<keyof typeof budgetCeilings, number>;

function budgetUsage(values: Partial<BudgetUsage> = {}): BudgetUsage {
  return Object.fromEntries(
    Object.keys(budgetCeilings).map((field) => [
      field,
      values[field as keyof BudgetUsage] ?? 0
    ])
  ) as BudgetUsage;
}

function addBudgetUsage(
  left: BudgetUsage,
  right: BudgetUsage
): BudgetUsage {
  return Object.fromEntries(
    Object.keys(budgetCeilings).map((field) => [
      field,
      left[field as keyof BudgetUsage] + right[field as keyof BudgetUsage]
    ])
  ) as BudgetUsage;
}

function budgetSnapshot(
  consumed: BudgetUsage,
  actionConsumption: BudgetUsage
) {
  return deepFreeze({
    ceilings: budgetCeilings,
    consumed,
    remaining: Object.fromEntries(
      Object.entries(budgetCeilings).map(([field, ceiling]) => [
        field,
        ceiling - consumed[field as keyof BudgetUsage]
      ])
    ),
    actionConsumption
  });
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const key of Reflect.ownKeys(value)) {
      deepFreeze(Reflect.get(value, key));
    }
    Object.freeze(value);
  }
  return value;
}

function deeplyFrozen(value: unknown): boolean {
  if (value === null || typeof value !== "object") return true;
  if (!Object.isFrozen(value)) return false;
  return Reflect.ownKeys(value).every((key) =>
    deeplyFrozen(Reflect.get(value, key))
  );
}
