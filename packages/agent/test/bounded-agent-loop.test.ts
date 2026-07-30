import { createHash } from "node:crypto";
import { types } from "node:util";
import {
  validateKnowledgeEvent,
  validateResidentLoopEventSequence,
  type KnowledgeEvent
} from "../../ontology/src/contracts.js";
import { describe, expect, it } from "vitest";

const tenBudgetFields = Object.freeze([
  "planRevisions",
  "observationRecords",
  "toolSteps",
  "providerInvocations",
  "providerRequestBytes",
  "providerResponseBytes",
  "contextBytes",
  "derivativeArtifactBytes",
  "activeExecutionMs",
  "approvalSuspensionMs"
] as const);

const hardMaximums = Object.freeze({
  planRevisions: 3,
  observationRecords: 16,
  toolSteps: 12,
  providerInvocations: 3,
  providerRequestBytes: 1_048_576,
  providerResponseBytes: 1_048_576,
  contextBytes: 1_048_576,
  derivativeArtifactBytes: 16_777_216,
  activeExecutionMs: 900_000,
  approvalSuspensionMs: 86_400_000
});

const harnessAttemptId =
  "attempt_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const foreignAttemptId =
  "attempt_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

type BudgetField = typeof tenBudgetFields[number];
type BoundaryEffects = {
  provider: number;
  gatewayInvocation: number;
  approvalConsumption: number;
  ledgerAppend: number;
  projectionSubstitute: number;
  fallback: number;
  localWrite: number;
  route: number;
  defaultRuntime: number;
};

type CanonicalToolStepMaterial = Readonly<{
  gatewayReadbacks: Readonly<Record<string, unknown>>;
  allowlistEntryHash: `sha256:${string}`;
  sideEffectClass: "ledger-proposal" | "ledger-review";
  requiredApprovalClass: "none" | "ledger-review";
  previewHash: `sha256:${string}`;
  inputArtifactHashes: readonly `sha256:${string}`[];
  resultArtifactHashes: readonly `sha256:${string}`[];
}>;

type SuspensionSemanticKeys = Readonly<{
  suspensionSemanticKey: `sha256:${string}`;
  resultSemanticKey: `sha256:${string}`;
}>;

type DeepBoundedLoopApi = {
  readonly createResidentBoundedAgentLoopFromIssuedCapabilities: (...args: unknown[]) => unknown;
};

type IssuedLoop = {
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly loop: {
    readonly advance: (candidate: unknown) => Promise<unknown>;
    readonly resume: (input: unknown) => Promise<unknown>;
  };
};

type HarnessBranch =
  | "completed"
  | "approval-required"
  | "effect-outcome-unknown-automatic"
  | "effect-outcome-unknown-human"
  | "resume";

const nonRequestedApprovalRereadStages = Object.freeze([
  "human-approved",
  "claimed",
  "completed",
  "denied",
  "failed"
] as const);

type ApprovalRereadStage =
  | "requested"
  | typeof nonRequestedApprovalRereadStages[number];

type HarnessMutation =
  | "none"
  | "missing-replay-result"
  | "constant-default-result"
  | "missing-full-readback"
  | "cross-task-readback"
  | "cross-run-readback"
  | "cross-authority-readback"
  | "non-completed-handoff-state"
  | "selected-readback-mismatch"
  | "missing-recorded-event"
  | "missing-terminal-event"
  | "missing-task-status-event"
  | "consumed-plus-remaining-mismatch"
  | "replan-budget-reset"
  | "event-version"
  | "event-stream"
  | "event-sequence-gap"
  | "event-context"
  | "payload-binding"
  | "plan-readback"
  | "tool-binding-state"
  | "observation-causation"
  | "final-observation-causation"
  | "terminal-final-readback"
  | "required-action-budget-zero"
  | "missing-suspension"
  | "failed-reclaim"
  | "cross-run-anchor"
  | "deadline-mismatch"
  | "next-safe-action-mismatch"
  | "category-mismatch"
  | "receipt-on-unknown-claim"
  | "terminal-on-unknown-claim"
  | "burned-tool-request-reuse"
  | "prior-process-candidate-cache"
  | "prior-process-gateway-permit";

interface HarnessOptions {
  readonly branch?: HarnessBranch;
  readonly mutation?: HarnessMutation;
  readonly budgetField?: BudgetField;
  readonly overBudget?: boolean;
  readonly approvalRereadStage?: ApprovalRereadStage;
}

interface IssuedCapabilityHarness {
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly binding: Readonly<Record<string, unknown>>;
  readonly initialCandidate: Readonly<Record<string, unknown>>;
  readonly resumeInput: Readonly<Record<string, unknown>>;
  readonly expectedResult: Readonly<Record<string, unknown>>;
  readonly releasedCheckpointReadback: Readonly<Record<string, unknown>>;
  readonly effects: BoundaryEffects;
  readonly trace: readonly string[];
  readonly positionalArguments: () => unknown[];
  readonly exercisePositiveControl: () => Promise<void>;
  readonly assertSettled: () => void;
  readonly assertCompletionReadback: () => void;
  readonly assertSuspendedThroughWake: () => void;
  readonly assertDurableResume: () => void;
  readonly suspensionSemanticKeys: () => SuspensionSemanticKeys | undefined;
}

describe("bounded resident agent loop", () => {
  it("completes only from exact H full readback under all ten replayed budgets", async () => {
    const preflight = createIssuedCapabilityHarness();
    await preflight.exercisePositiveControl();
    const api = await boundedLoopApi();

    for (const budgetField of tenBudgetFields) {
      const harness = createIssuedCapabilityHarness({ budgetField });
      const issued = await issueLoop(api, harness);
      const result = await issued.loop.advance(harness.initialCandidate);

      expect(result, budgetField).toEqual(harness.expectedResult);
      harness.assertSettled();
      harness.assertCompletionReadback();
      if (budgetField === tenBudgetFields[0]) {
        expect.soft(harness.trace, "completed durable replay").toEqual([
          "T120.readReplay",
          "W.reverifyAfterAwait",
          "H.readFull",
          "W.reverifyAfterAwait"
        ]);
      }
      expect(harness.effects).toEqual(zeroEffects());
    }

    const exactReplayMutations: readonly HarnessMutation[] = [
      "event-version",
      "event-stream",
      "event-sequence-gap",
      "event-context",
      "payload-binding",
      "plan-readback",
      "tool-binding-state",
      "observation-causation",
      "final-observation-causation",
      "terminal-final-readback",
      "required-action-budget-zero"
    ];
    const completionMutations: readonly HarnessMutation[] = [
      "missing-replay-result",
      "constant-default-result",
      "missing-full-readback",
      "cross-task-readback",
      "cross-run-readback",
      "cross-authority-readback",
      "non-completed-handoff-state",
      "selected-readback-mismatch",
      "missing-recorded-event",
      "missing-terminal-event",
      "missing-task-status-event",
      "consumed-plus-remaining-mismatch",
      "replan-budget-reset",
      ...exactReplayMutations
    ];
    for (const mutation of completionMutations) {
      const harness = createIssuedCapabilityHarness({ mutation });
      const outcome = await captureAdvance(api, harness);
      expect.soft(outcome, mutation).toBe("rejected");
      harness.assertSettled();
      expect(harness.effects, mutation).toEqual(zeroEffects());
      if (exactReplayMutations.includes(mutation)) {
        expect.soft(
          harness.trace,
          `${mutation}:before exact replay rejection`
        ).toEqual([
          "T120.readReplay",
          "W.reverifyAfterAwait"
        ]);
      }
    }
    for (const budgetField of tenBudgetFields) {
      const harness = createIssuedCapabilityHarness({ budgetField, overBudget: true });
      expect(await captureAdvance(api, harness), budgetField).toBe("rejected");
      harness.assertSettled();
      expect(harness.effects, budgetField).toEqual(zeroEffects());
    }
  });

  it("suspends approval and unknown outcomes through W and resumes from durable replay", async () => {
    for (const branch of [
      "approval-required",
      "effect-outcome-unknown-automatic",
      "effect-outcome-unknown-human",
      "resume"
    ] as const) {
      await createIssuedCapabilityHarness({ branch }).exercisePositiveControl();
    }
    for (const approvalRereadStage of nonRequestedApprovalRereadStages) {
      await createIssuedCapabilityHarness({
        branch: "approval-required",
        approvalRereadStage
      }).exercisePositiveControl();
    }
    const api = await boundedLoopApi();

    let approvalSemanticKeys: SuspensionSemanticKeys | undefined;
    for (const branch of [
      "approval-required",
      "effect-outcome-unknown-automatic",
      "effect-outcome-unknown-human"
    ] as const) {
      const harness = createIssuedCapabilityHarness({ branch });
      const issued = await issueLoop(api, harness);
      const result = await issued.loop.advance(harness.initialCandidate);

      expect(result, branch).toBe(harness.releasedCheckpointReadback);
      expectExactFrozenDataSurface(
        result,
        [
          "schemaVersion",
          "checkpointEventId",
          "suspensionEventId",
          "resultEventId",
          "releaseEventId"
        ],
        `${branch} released checkpoint readback`
      );
      harness.assertSettled();
      harness.assertSuspendedThroughWake();
      if (branch === "approval-required") {
        approvalSemanticKeys = harness.suspensionSemanticKeys();
      }
      const settledTrace = [...harness.trace];
      const settledEffects = { ...harness.effects };
      expect.soft(
        await captureIssuedAdvance(issued, harness.initialCandidate),
        `${branch}:consumed-currentness`
      ).toBe("rejected");
      expect.soft(harness.trace, `${branch}:consumed-currentness trace`).toEqual(
        settledTrace
      );
      expect.soft(
        harness.effects,
        `${branch}:consumed-currentness effects`
      ).toEqual(
        settledEffects
      );
    }

    const failedReclaim = createIssuedCapabilityHarness({
      branch: "resume",
      mutation: "failed-reclaim"
    });
    const failedReclaimLoop = await issueLoop(api, failedReclaim);
    expect.soft(
      await captureIssuedResume(failedReclaimLoop, failedReclaim.resumeInput),
      "failed-reclaim"
    ).toBe("rejected");
    const failedReclaimTrace = [...failedReclaim.trace];
    const failedReclaimEffects = { ...failedReclaim.effects };
    expect.soft(
      await captureIssuedAdvance(
        failedReclaimLoop,
        failedReclaim.initialCandidate
      ),
      "failed-reclaim consumed currentness"
    ).toBe("rejected");
    expect.soft(failedReclaim.trace, "failed-reclaim trace").toEqual(
      failedReclaimTrace
    );
    expect.soft(failedReclaim.effects, "failed-reclaim effects").toEqual(
      failedReclaimEffects
    );

    const identicalApproval = createIssuedCapabilityHarness({
      branch: "approval-required"
    });
    const identicalApprovalLoop = await issueLoop(api, identicalApproval);
    await identicalApprovalLoop.loop.advance(identicalApproval.initialCandidate);
    identicalApproval.assertSettled();
    identicalApproval.assertSuspendedThroughWake();
    expect(identicalApproval.suspensionSemanticKeys()).toEqual(
      approvalSemanticKeys
    );

    for (const approvalRereadStage of nonRequestedApprovalRereadStages) {
      const nonRequested = createIssuedCapabilityHarness({
        branch: "approval-required",
        approvalRereadStage
      });
      expect(
        await captureAdvance(api, nonRequested),
        approvalRereadStage
      ).toBe("rejected");
      nonRequested.assertSettled();
      expectTraceSubsequence(nonRequested.trace, [
        "G.requestFreshAuthorized:initial",
        "W.reverifyAfterAwait",
        "G.readCanonicalToolStepMaterial:requested",
        "G.readFreshHumanDecision",
        "W.reverifyAfterAwait",
        "G.rereadAndIssueFromLedger",
        `G.rereadAndIssueFromLedger:${approvalRereadStage}`,
        "W.reverifyAfterAwait"
      ]);
      expect(nonRequested.trace.at(-1), approvalRereadStage).toBe(
        "W.reverifyAfterAwait"
      );
      expect(
        nonRequested.trace.filter(
          (entry) => entry === "W.reverifyAfterAwait"
        ),
        approvalRereadStage
      ).toHaveLength(10);
      expect(
        nonRequested.trace.filter(
          (entry) => entry === "G.readCanonicalToolStepMaterial"
        ),
        approvalRereadStage
      ).toHaveLength(1);
      expect(nonRequested.trace, approvalRereadStage).not.toContain(
        `G.readCanonicalToolStepMaterial:${approvalRereadStage}`
      );
      expect(
        nonRequested.trace.filter((entry) => entry.startsWith("T120.appended:")),
        approvalRereadStage
      ).toEqual([
        "T120.appended:evt_plan_bounded_1",
        "T120.appended:evt_observation_bounded_1"
      ]);
      for (const forbidden of [
        "G.executeFreshAuthorized",
        "T120.appendToolStep",
        "T120.appendSuspension",
        "T120.appendResult",
        "W.suspendAndRelease",
        "W.internal.completeOrValidateClaim",
        "W.internal.T120.appendSuspension",
        "W.internal.T120.appendResult",
        "H.readFull"
      ]) {
        expect(nonRequested.trace, `${approvalRereadStage}:${forbidden}`)
          .not.toContain(forbidden);
      }
      expect(nonRequested.effects, approvalRereadStage).toEqual({
        ...zeroEffects(),
        ledgerAppend: 3
      });
    }

    const resumed = createIssuedCapabilityHarness({ branch: "resume" });
    const resumedLoop = await issueLoop(api, resumed);
    const resumedResult = await resumedLoop.loop.resume(resumed.resumeInput);
    expect(resumedResult).toEqual(resumed.expectedResult);
    resumed.assertSettled();
    resumed.assertDurableResume();

    const rejectedResumeMutations: readonly HarnessMutation[] = [
      "missing-suspension",
      "cross-run-anchor",
      "deadline-mismatch",
      "next-safe-action-mismatch",
      "category-mismatch",
      "receipt-on-unknown-claim",
      "terminal-on-unknown-claim",
      "burned-tool-request-reuse",
      "prior-process-candidate-cache",
      "prior-process-gateway-permit"
    ];
    for (const mutation of rejectedResumeMutations) {
      const harness = createIssuedCapabilityHarness({ branch: "resume", mutation });
      expect(await captureResume(api, harness), mutation).toBe("rejected");
      harness.assertSettled();
      expect(harness.effects, mutation).toEqual({
        ...zeroEffects(),
        ledgerAppend: mutation === "prior-process-gateway-permit"
          ? 1
          : mutation === "prior-process-candidate-cache"
            ? 2
            : 0
      });
    }
  });

  it("fails closed with zero fallback write or effect on every hostile boundary", async () => {
    const preflight = createIssuedCapabilityHarness();
    await preflight.exercisePositiveControl();
    const api = await boundedLoopApi();

    const valid = createIssuedCapabilityHarness();
    const issued = await issueLoop(api, valid);
    expect(await issued.loop.advance(valid.initialCandidate)).toEqual(valid.expectedResult);
    valid.assertSettled();
    valid.assertCompletionReadback();

    for (const hostile of hostileCases()) {
      const harness = createIssuedCapabilityHarness({
        branch: hostile.branch ?? "completed"
      });
      const args = harness.positionalArguments();
      const prepared = hostile.prepare(args, harness.initialCandidate);

      if (hostile.label === "own-prototype-data") {
        let synchronouslyRejected = false;
        try {
          Reflect.apply(
            api.createResidentBoundedAgentLoopFromIssuedCapabilities,
            undefined,
            args
          );
        } catch {
          synchronouslyRejected = true;
        }
        expect(synchronouslyRejected, hostile.label).toBe(true);
        expect(harness.trace, hostile.label).toEqual([]);
        expect(harness.effects, hostile.label).toEqual(zeroEffects());
        expect(prepared.proxyReads(), hostile.label).toBe(0);
        continue;
      }
      expect(
        await captureHostile(api, args, prepared.candidate, prepared.afterInvoke),
        hostile.label
      ).toBe("rejected");
      if (
        hostile.label !== "swapped-capability" &&
        hostile.label !== "stale-capability"
      ) {
        harness.assertSettled();
      }
      expect(harness.effects, hostile.label).toEqual(zeroEffects());
      expect(prepared.proxyReads(), hostile.label).toBe(0);
    }
  });
});

async function boundedLoopApi(): Promise<DeepBoundedLoopApi> {
  const deepModulePath = ["..", "src", "bounded-agent-loop.js"].join("/");
  const imported: unknown = await import(deepModulePath).catch(() => undefined);
  const issuer = imported !== null && typeof imported === "object"
    ? Reflect.get(imported, "createResidentBoundedAgentLoopFromIssuedCapabilities")
    : undefined;
  expect(issuer, "approved bounded-agent-loop deep API is absent").toBeTypeOf("function");
  if (typeof issuer !== "function") throw new Error("bounded resident loop issuer is unavailable");
  return Object.freeze({
    createResidentBoundedAgentLoopFromIssuedCapabilities: issuer as (...args: unknown[]) => unknown
  });
}

async function issueLoop(
  api: DeepBoundedLoopApi,
  harness: IssuedCapabilityHarness,
  args = harness.positionalArguments()
): Promise<IssuedLoop> {
  const raw = await Promise.resolve(
    Reflect.apply(api.createResidentBoundedAgentLoopFromIssuedCapabilities, undefined, args)
  );
  expect(raw).toBeTypeOf("object");
  expect(raw).not.toBeNull();
  if (raw === null || typeof raw !== "object") throw new Error("bounded loop issuance failed");
  expectExactFrozenDataSurface(raw, ["loop", "metadata"], "issued loop");
  const metadata = Reflect.get(raw, "metadata");
  const loop = Reflect.get(raw, "loop");
  expect(metadata).toEqual(harness.metadata);
  expect(Object.isFrozen(metadata)).toBe(true);
  expect(loop).toBeTypeOf("object");
  expect(loop).not.toBeNull();
  if (loop === null || typeof loop !== "object") throw new Error("bounded loop control is unavailable");
  expectExactFrozenDataSurface(loop, ["advance", "resume"], "loop controls");
  expect(Reflect.get(loop, "advance")).toBeTypeOf("function");
  expect(Reflect.get(loop, "resume")).toBeTypeOf("function");
  return raw as IssuedLoop;
}

async function captureAdvance(
  api: DeepBoundedLoopApi,
  harness: IssuedCapabilityHarness
): Promise<"accepted" | "rejected"> {
  try {
    const issued = await issueLoop(api, harness);
    const result = await issued.loop.advance(harness.initialCandidate);
    return isUnavailable(result) ? "rejected" : "accepted";
  } catch {
    return "rejected";
  }
}

async function captureResume(
  api: DeepBoundedLoopApi,
  harness: IssuedCapabilityHarness
): Promise<"accepted" | "rejected"> {
  try {
    const issued = await issueLoop(api, harness);
    const result = await issued.loop.resume(harness.resumeInput);
    return isUnavailable(result) ? "rejected" : "accepted";
  } catch {
    return "rejected";
  }
}

async function captureIssuedAdvance(
  issued: IssuedLoop,
  candidate: unknown
): Promise<"accepted" | "rejected"> {
  try {
    const result = await issued.loop.advance(candidate);
    return isUnavailable(result) ? "rejected" : "accepted";
  } catch {
    return "rejected";
  }
}

async function captureIssuedResume(
  issued: IssuedLoop,
  input: unknown
): Promise<"accepted" | "rejected"> {
  try {
    const result = await issued.loop.resume(input);
    return isUnavailable(result) ? "rejected" : "accepted";
  } catch {
    return "rejected";
  }
}

async function captureHostile(
  api: DeepBoundedLoopApi,
  args: unknown[],
  candidate: unknown,
  afterInvoke?: () => void
): Promise<"accepted" | "rejected"> {
  try {
    const placeholder = createIssuedCapabilityHarness();
    const issued = await issueLoop(api, placeholder, args);
    const pending = issued.loop.advance(candidate);
    afterInvoke?.();
    const result = await pending;
    return isUnavailable(result) ? "rejected" : "accepted";
  } catch {
    return "rejected";
  }
}

function isUnavailable(value: unknown): boolean {
  return value !== null &&
    typeof value === "object" &&
    Reflect.get(value, "schemaVersion") === "resident-loop-unavailable.v1" &&
    Reflect.get(value, "outcome") === "unavailable";
}

function createIssuedCapabilityHarness(
  options: HarnessOptions = {}
): IssuedCapabilityHarness {
  const branch = options.branch ?? "completed";
  const mutation = options.mutation ?? "none";
  const approvalRereadStage = options.approvalRereadStage ?? "requested";
  if (
    approvalRereadStage !== "requested" &&
    branch !== "approval-required"
  ) {
    throw new Error("non-requested approval rereads require the approval branch");
  }
  const effects = zeroEffects();
  const trace: string[] = [];
  let awaitPending = false;
  let tokenSerial = 0;
  let activeToken: object | undefined;

  const authorityBinding = deepFreeze({
    workspaceIdentityHash: hash("6"),
    mountGeneration: "mount_generation_bounded_1",
    ledgerStoreIdentity: "ledger_bounded_harness",
    artifactStoreIdentity: "artifact_bounded_harness",
    ledgerHighWaterEventId: "evt_source_bounded_2",
    policyHash: hash("a"),
    activeLocksHash: hash("b")
  });
  const providerPosture = deepFreeze({
    schemaVersion: "resident-loop-provider-posture.v1",
    residentAgentId: "agent_default",
    workspace: {
      workspaceId: "ws_bounded_harness",
      mountInstanceId: "mount_bounded_harness",
      admissionGenerationId: "admission_generation_1",
      policyVersion: "policy_bounded_v1",
      policyDigest: hash("a"),
      lockStateDigest: hash("b"),
      highWaterMark: "evt_source_bounded_2",
      highWaterOrdinal: 17
    },
    run: {
      taskId: "task_bounded_harness",
      attemptId: harnessAttemptId,
      runId: "run_bounded_harness"
    },
    selection: {
      providerId: "provider_bounded_harness",
      modelId: "model_bounded_harness",
      adapterVersion: "adapter_bounded_v1",
      selectionPolicyVersion: "policy_bounded_v1",
      endpointPolicyId: "endpoint_policy_bounded_harness"
    },
    capability: {
      capabilityId: "provider_bounded_harness",
      capabilityVersion: "agent-provider-capability.v2",
      capabilityHash: hash("c"),
      capabilitySourceEventId: "evt_capability_bounded",
      capabilityRevision: "capability_revision_bounded"
    },
    credentialReference: {
      credentialRefId: "agent_credref_bounded",
      credentialKind: "api-key-bearer",
      sourceEventIds: ["evt_credential_bounded"]
    },
    feasibility: {
      feasibilityId: "provider_feasibility_bounded",
      lane: "byok",
      assessedAt: "2026-07-28T12:00:00.000Z",
      sourceEventIds: [
        "evt_capability_bounded",
        "evt_credential_bounded",
        "evt_endpoint_bounded"
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
  const metadata = deepFreeze({
    schemaVersion: "resident-loop-factory-ports.v1",
    residentAgentId: "agent_default",
    workspace: providerPosture.workspace,
    run: providerPosture.run,
    providerPosture: {
      selection: {
        providerId: providerPosture.selection.providerId,
        modelId: providerPosture.selection.modelId,
        adapterVersion: providerPosture.selection.adapterVersion
      },
      capability: {
        capabilityId: providerPosture.capability.capabilityId,
        capabilityVersion: providerPosture.capability.capabilityVersion,
        capabilityHash: providerPosture.capability.capabilityHash,
        capabilityRevision: providerPosture.capability.capabilityRevision
      },
      approval: providerPosture.approval,
      binding: providerPosture.binding
    }
  });
  const policy = deepFreeze({
    policyId: "agent_policy_bounded",
    policyVersion: "policy_bounded_v1",
    policyHash: hash("a")
  });
  const sourceEventIds = deepFreeze([
    "evt_source_bounded_1",
    "evt_source_bounded_2"
  ]);
  const contextPackRefs = deepFreeze([{
    contextPackId: "context_pack_bounded",
    contentHash: hash("f")
  }]);
  const binding = deepFreeze({
    residentAgentId: "agent_default",
    workspaceId: "ws_bounded_harness",
    taskId: "task_bounded_harness",
    attemptId: harnessAttemptId,
    runId: "run_bounded_harness",
    runMode: "evidence-triage",
    retryGeneration: 0,
    policy,
    authority: {
      authorityBinding,
      sourceEventIds,
      contextPackRefs
    },
    providerPosture
  });
  const humanBranch =
    branch === "approval-required" ||
    branch === "effect-outcome-unknown-human";
  const plannedTool = deepFreeze({
    toolId: humanBranch ? "legacy.staging.approve" : "legacy.staging.execute",
    toolVersion: "0.1.0",
    allowlistEntryHash: hash("8"),
    sideEffectClass: humanBranch ? "ledger-review" as const : "ledger-proposal" as const,
    requiredApprovalClass: humanBranch ? "ledger-review" as const : "none" as const
  });
  const gatewayPreviewHash = hash("3");
  const gatewayInputArtifactHashes = deepFreeze([hash("4")]);
  const gatewayResultArtifactHashes = deepFreeze([hash("7")]);

  const candidateBudget = budget("contextBytes");
  const observationBudget = budget(
    "observationRecords",
    false,
    candidateBudget.consumed
  );
  const toolStepBudget = budget(
    "toolSteps",
    false,
    observationBudget.consumed
  );
  const finalObservationBudget = budgetWithAdditionalConsumption(
    "observationRecords",
    options.budgetField,
    options.overBudget === true,
    toolStepBudget.consumed
  );
  const durableBudget = budget(
    "activeExecutionMs",
    false,
    finalObservationBudget.consumed
  );
  if (mutation === "consumed-plus-remaining-mismatch") {
    durableBudget.remaining.contextBytes += 1;
  }
  const proposedPlan = deepFreeze({
    schemaVersion: "resident-plan-record.v2",
    residentAgentId: binding.residentAgentId,
    workspaceId: binding.workspaceId,
    taskId: binding.taskId,
    attemptId: binding.attemptId,
    runId: binding.runId,
    runMode: binding.runMode,
    workflowDescriptor: {
      workflowDescriptorId: "workflow_evidence_triage",
      workflowDescriptorVersion: "v1",
      workflowDescriptorHash: hash("2")
    },
    policy,
    authority: authorityBinding,
    sourceEventIds,
    contextPackRefs,
    budget: candidateBudget,
    causationId: "evt_admission_bounded",
    correlationId: "corr_bounded_harness",
    planId: "plan_bounded_1",
    planRevision: 0,
    priorPlanReadback: null,
    replanObservationReadback: null,
    steps: [{
      ordinal: 1,
      purpose: "Read the bounded fixture.",
      toolId: plannedTool.toolId,
      toolVersion: plannedTool.toolVersion,
      allowlistEntryHash: plannedTool.allowlistEntryHash,
      expectedSafeOutputClass: "proposal",
      prerequisiteStepOrdinals: []
    }]
  });
  const policyConstraints = deepFreeze({
    toolAllowlist: [{
      toolId: plannedTool.toolId,
      toolVersion: plannedTool.toolVersion,
      allowlistEntryHash: plannedTool.allowlistEntryHash,
      expectedSafeOutputClass: "proposal",
      prerequisiteStepOrdinals: [],
      sideEffectClass: plannedTool.sideEffectClass,
      requiredApprovalClass: plannedTool.requiredApprovalClass
    }],
    permittedAutomaticActionClasses: ["ledger-proposal"],
    requiredApprovalClasses: humanBranch
      ? ["ledger-review", "provider-byte-transfer"]
      : ["none", "provider-byte-transfer"]
  });
  const canonicalInitialCandidate = deepFreeze({
    kind: "initial",
    proposedPlan,
    providerPosture,
    policyConstraints
  });
  const requestedGatewayReadbacks = deepFreeze({
    authorizationKind: humanBranch ? "human-approval" : "automatic-policy",
    stage: "requested",
    requestEventId: "evt_gateway_request"
  });
  const claimedGatewayReadbacks = deepFreeze({
    ...requestedGatewayReadbacks,
    stage: "claimed",
    ...(humanBranch ? {
      decisionEventId: "evt_gateway_decision",
      approvedBy: "human_bounded_reviewer",
      approvedPreviewHash: gatewayPreviewHash
    } : {}),
    executionClaimEventId: "evt_gateway_claim"
  });
  const humanCompletedGatewayReadbacks = deepFreeze({
    ...claimedGatewayReadbacks,
    stage: "completed",
    outcomeReceiptEventId: "evt_gateway_receipt",
    resultEventId: "evt_gateway_result"
  });
  const humanDeniedGatewayReadbacks = deepFreeze({
    authorizationKind: "human-approval",
    stage: "denied",
    requestEventId: "evt_gateway_request",
    denialEventId: "evt_gateway_denial"
  });
  const humanFailedGatewayReadbacks = deepFreeze({
    authorizationKind: "human-approval",
    stage: "failed",
    failurePhase: "pre-approval",
    requestEventId: "evt_gateway_request",
    resultEventId: "evt_gateway_failure"
  });
  const completedGatewayReadbacks = deepFreeze({
    authorizationKind: "automatic-policy",
    stage: "completed",
    requestEventId: "evt_gateway_request",
    executionClaimEventId: "evt_gateway_claim",
    outcomeReceiptEventId: "evt_gateway_receipt",
    resultEventId: "evt_gateway_result"
  });
  const replanCompletedGatewayReadbacks = deepFreeze({
    authorizationKind: "automatic-policy",
    stage: "completed",
    requestEventId: "evt_gateway_request_replan",
    executionClaimEventId: "evt_gateway_claim_replan",
    outcomeReceiptEventId: "evt_gateway_receipt_replan",
    resultEventId: "evt_gateway_result_replan"
  });
  const replanRequestedGatewayReadbacks = deepFreeze({
    authorizationKind: "automatic-policy",
    stage: "requested",
    requestEventId: "evt_gateway_request_replan"
  });
  const toolMaterial = (
    gatewayReadbacks: Readonly<Record<string, unknown>>,
    resultArtifactHashes: readonly `sha256:${string}`[]
  ): CanonicalToolStepMaterial => deepFreeze({
    gatewayReadbacks,
    allowlistEntryHash: plannedTool.allowlistEntryHash,
    sideEffectClass: plannedTool.sideEffectClass,
    requiredApprovalClass: plannedTool.requiredApprovalClass,
    previewHash: gatewayPreviewHash,
    inputArtifactHashes: gatewayInputArtifactHashes,
    resultArtifactHashes
  });
  const requestedToolMaterial = toolMaterial(requestedGatewayReadbacks, []);
  const claimedToolMaterial = toolMaterial(claimedGatewayReadbacks, []);
  const completedToolMaterial = toolMaterial(
    completedGatewayReadbacks,
    gatewayResultArtifactHashes
  );
  const replanCompletedToolMaterial = toolMaterial(
    replanCompletedGatewayReadbacks,
    gatewayResultArtifactHashes
  );
  const replanRequestedToolMaterial = toolMaterial(
    replanRequestedGatewayReadbacks,
    []
  );
  const approvalRereadToolMaterials: Readonly<
    Record<ApprovalRereadStage, CanonicalToolStepMaterial | undefined>
  > = Object.freeze({
    requested: requestedToolMaterial,
    "human-approved": undefined,
    claimed: claimedToolMaterial,
    completed: toolMaterial(
      humanCompletedGatewayReadbacks,
      gatewayResultArtifactHashes
    ),
    denied: toolMaterial(humanDeniedGatewayReadbacks, []),
    failed: toolMaterial(humanFailedGatewayReadbacks, [])
  });
  const initialToolMaterial = branch === "completed"
    ? completedToolMaterial
    : branch === "approval-required"
      ? requestedToolMaterial
      : claimedToolMaterial;
  const planEvent = residentPlanEvent(proposedPlan, candidateBudget);
  const observationEvent = residentObservationEvent(planEvent, observationBudget);
  const toolStepEvent = residentToolStepEvent(
    planEvent,
    observationEvent,
    toolStepBudget,
    initialToolMaterial
  );
  const finalObservationEvent = residentFinalObservationEvent(
    planEvent,
    toolStepEvent,
    finalObservationBudget
  );
  const suspensionBudget = budget(
    "approvalSuspensionMs",
    false,
    finalObservationBudget.consumed
  );
  const resumableResultBudget = budget(
    "activeExecutionMs",
    false,
    suspensionBudget.consumed
  );
  const controlSemanticKeys = deepFreeze({
    suspensionSemanticKey: semanticKeyFor(
      "resident-loop-suspension",
      { binding, planId: proposedPlan.planId }
    ),
    resultSemanticKey: semanticKeyFor(
      "resident-loop-result",
      { binding, finalObservationId: finalObservationEvent.id }
    )
  });

  const suspension = residentSuspension(
    branch === "approval-required" ? "approval-required" : "effect-outcome-unknown",
    suspensionBudget,
    mutation,
    planEvent,
    finalObservationEvent,
    branch,
    initialToolMaterial
  );
  const completionResult = residentResult(
    "handoff-recorded",
    durableBudget,
    true,
    planEvent,
    finalObservationEvent,
    authorityBinding
  );
  let resumableResult = residentResult(
    branch === "approval-required" ? "approval-required" : "effect-outcome-unknown",
    resumableResultBudget,
    false,
    planEvent,
    finalObservationEvent,
    authorityBinding,
    undefined,
    controlSemanticKeys.resultSemanticKey
  );
  const releasedCheckpointReadback = deepFreeze({
    schemaVersion: "resident-loop-released-checkpoint-readback.v1",
    checkpointEventId: "evt_orchestration_checkpoint",
    suspensionEventId: suspension.id,
    resultEventId: resumableResult.id,
    releaseEventId: "evt_orchestration_release"
  });
  const replayCompletion = mutation === "constant-default-result"
    ? deepFreeze({
        schemaVersion: "resident-loop-result.v2",
        outcome: "completed",
        category: "handoff-recorded"
      })
    : completionResult;
  const replayEvents: Readonly<Record<string, unknown>>[] = branch === "completed"
    ? mutation === "missing-replay-result" || mutation === "replan-budget-reset"
      ? [planEvent, observationEvent, toolStepEvent, finalObservationEvent]
      : mutateCompletedReplayEvents(
          [
            planEvent,
            observationEvent,
            toolStepEvent,
            finalObservationEvent,
            replayCompletion
          ],
          mutation
        )
    : branch === "resume"
      ? mutation === "missing-suspension"
        ? [planEvent, observationEvent, toolStepEvent, finalObservationEvent]
        : [
            planEvent,
            observationEvent,
            toolStepEvent,
            finalObservationEvent,
            suspension,
            resumableResult
          ]
      : [];
  let currentReplayEvents = replayEvents;
  const replayFor = (
    events: readonly Readonly<Record<string, unknown>>[]
  ) => deepFreeze({
    identity: {
      residentAgentId: binding.residentAgentId,
      workspaceId: binding.workspaceId,
      taskId: binding.taskId,
      attemptId: binding.attemptId,
      runId: binding.runId
    },
    events,
    plans: events.filter((event) =>
      Reflect.get(event, "type") === "agent.resident-plan.recorded.v2"
    ),
    observations: events.filter((event) =>
      Reflect.get(event, "type") === "agent.resident-observation.recorded.v2"
    ),
    toolSteps: events.filter((event) =>
      Reflect.get(event, "type") === "agent.resident-tool-step.recorded.v2"
    ),
    suspensions: events.filter((event) =>
      Reflect.get(event, "type") === "agent.resident-loop.suspended.v2"
    ),
    results: events.filter((event) =>
      Reflect.get(event, "type") === "agent.resident-loop.result.recorded.v2"
    )
  });
  const replay = () => replayFor(currentReplayEvents);
  const durablePlanPrefix = replayFor([
    planEvent,
    observationEvent,
    toolStepEvent,
    finalObservationEvent
  ]);

  const recoveryObservationBudget = budget(
    "observationRecords",
    false,
    resumableResultBudget.consumed
  );
  const recoveryObservationEvent = residentRecoveryObservationEvent(
    planEvent,
    resumableResult,
    recoveryObservationBudget
  );
  const resumeRecoveryReplay = replayFor([
    ...replayEvents,
    recoveryObservationEvent
  ]);
  const replanBudget = budget(
    "planRevisions",
    false,
    branch === "resume"
      ? recoveryObservationBudget.consumed
      : finalObservationBudget.consumed
  );
  if (mutation === "replan-budget-reset") {
    replanBudget.consumed.planRevisions = 0;
    replanBudget.remaining.planRevisions = replanBudget.ceilings.planRevisions;
  }
  const replanObservationReadback = branch === "resume"
    ? recoveryObservationEvent
    : finalObservationEvent;
  const replanCandidate = deepFreeze({
    kind: "replan",
    priorPlan: planEvent,
    priorPlanReadback: branch === "resume"
      ? resumeRecoveryReplay
      : durablePlanPrefix,
    replanObservationReadback,
    proposedPlan: {
      ...proposedPlan,
      planId: "plan_bounded_2",
      planRevision: 1,
      priorPlanReadback: {
        ...planReadbackFor(planEvent),
        priorPlanRecordEventId: planEvent.id
      },
      replanObservationReadback: observationReadbackFor(replanObservationReadback),
      budget: replanBudget,
      causationId: replanObservationReadback.id
    }
  });
  const replanPlanEvent = residentPlanEvent(
    replanCandidate.proposedPlan as Readonly<Record<string, unknown>>,
    replanBudget,
    {
      id: "evt_plan_bounded_2",
      sequence: 8,
      toolRequestId: "toolreq_bounded_replan"
    }
  );
  const resumeObservationBudget = budget(
    "observationRecords",
    false,
    replanBudget.consumed
  );
  const resumeObservationEvent = residentObservationEvent(
    replanPlanEvent,
    resumeObservationBudget,
    {
      id: "evt_observation_bounded_2",
      sequence: 9,
      observationId: "observation_bounded_2"
    }
  );
  const resumeToolStepBudget = budget(
    "toolSteps",
    false,
    resumeObservationBudget.consumed
  );
  const resumeToolStepEvent = residentToolStepEvent(
    replanPlanEvent,
    resumeObservationEvent,
    resumeToolStepBudget,
    replanCompletedToolMaterial,
    {
      id: "evt_tool_step_bounded_2",
      sequence: 10,
      toolRequestId: "toolreq_bounded_replan"
    }
  );
  const resumeFinalObservationBudget = budget(
    "observationRecords",
    false,
    resumeToolStepBudget.consumed
  );
  const resumeFinalObservationEvent = residentFinalObservationEvent(
    replanPlanEvent,
    resumeToolStepEvent,
    resumeFinalObservationBudget,
    {
      id: "evt_observation_bounded_final_2",
      sequence: 11,
      observationId: "observation_bounded_final_2",
      toolRequestId: "toolreq_bounded_replan"
    }
  );
  const resumeTerminalBudget = budget(
    "activeExecutionMs",
    false,
    resumeFinalObservationBudget.consumed
  );
  const resumeTerminalResult = residentResult(
    "handoff-recorded",
    resumeTerminalBudget,
    true,
    replanPlanEvent,
    resumeFinalObservationEvent,
    authorityBinding,
    12
  );
  let expectedResult = branch === "resume"
    ? resumeTerminalResult
    : branch === "completed"
      ? completionResult
      : resumableResult;
  const initialCandidate = mutation === "replan-budget-reset"
    ? replanCandidate
    : canonicalInitialCandidate;

  function issueToken(): object {
    const token = Object.freeze({
      schemaVersion: "resident-loop-currentness-token.v1",
      serial: ++tokenSerial
    });
    activeToken = token;
    return token;
  }
  const issuerToken = issueToken();
  if (branch === "resume") activeToken = undefined;

  function beginBoundary(label: string, receiver: unknown, owner: object): void {
    if (receiver !== owner) throw new Error(`${label} lost its issued capability identity`);
    if (awaitPending) throw new Error(`${label} continued without W revalidation`);
    trace.push(label);
  }

  async function finishBoundary<T>(value: T): Promise<T> {
    await Promise.resolve();
    awaitPending = true;
    return value;
  }

  async function appendExpected(
    input: unknown,
    expected: Readonly<Record<string, unknown>>,
    label: string
  ): Promise<Readonly<Record<string, unknown>>> {
    if (!sameCanonical(input, expected.payload)) {
      throw new Error(`${label} payload is not the exact next durable event`);
    }
    currentReplayEvents = [...currentReplayEvents, expected];
    trace.push(`T120.appended:${expected.id}`);
    effects.ledgerAppend += 1;
    return await finishBoundary(expected);
  }

  const lastReplayId = () => currentReplayEvents.at(-1)?.id;

  const planObservation = Object.freeze({
    async readReplay(this: unknown, identity: unknown) {
      beginBoundary("T120.readReplay", this, planObservation);
      if (!sameIdentity(identity, binding)) throw new Error("replay identity mismatch");
      return await finishBoundary(replay());
    },
    async appendPlan(this: unknown, input: unknown) {
      beginBoundary("T120.appendPlan", this, planObservation);
      const expected = currentReplayEvents.length === 0
        ? planEvent
        : lastReplayId() === recoveryObservationEvent.id
          ? replanPlanEvent
          : undefined;
      if (expected === undefined) throw new Error("plan append is out of causal order");
      return await appendExpected(input, expected, "plan");
    },
    async appendObservation(this: unknown, input: unknown) {
      beginBoundary("T120.appendObservation", this, planObservation);
      const expected = lastReplayId() === planEvent.id
        ? observationEvent
        : lastReplayId() === toolStepEvent.id
          ? finalObservationEvent
          : lastReplayId() === resumableResult.id
            ? recoveryObservationEvent
            : lastReplayId() === replanPlanEvent.id
              ? resumeObservationEvent
              : lastReplayId() === resumeToolStepEvent.id
                ? resumeFinalObservationEvent
                : undefined;
      if (expected === undefined) throw new Error("observation append is out of causal order");
      return await appendExpected(input, expected, "observation");
    },
    async appendToolStep(this: unknown, input: unknown) {
      beginBoundary("T120.appendToolStep", this, planObservation);
      const expected = lastReplayId() === observationEvent.id
        ? toolStepEvent
        : lastReplayId() === resumeObservationEvent.id
          ? resumeToolStepEvent
          : undefined;
      if (expected === undefined) throw new Error("tool-step append is out of causal order");
      return await appendExpected(input, expected, "tool step");
    },
    async appendSuspension(this: unknown, _input: unknown) {
      beginBoundary("T120.appendSuspension", this, planObservation);
      throw new Error("W owns suspension append authority");
    },
    async appendResult(this: unknown, input: unknown) {
      beginBoundary("T120.appendResult", this, planObservation);
      if (branch !== "resume" || lastReplayId() !== resumeFinalObservationEvent.id) {
        throw new Error("direct result append is unavailable on this branch");
      }
      return await appendExpected(input, resumeTerminalResult, "terminal result");
    },
    async readResult(this: unknown, eventId: unknown) {
      beginBoundary("T120.readResult", this, planObservation);
      const result = mutation === "missing-replay-result"
        ? undefined
        : currentReplayEvents.find((event) =>
            event.id === eventId &&
            event.type === "agent.resident-loop.result.recorded.v2"
          );
      if (result !== undefined) trace.push(`T120.readback:${result.id}`);
      return await finishBoundary(result);
    },
    async readPlan(this: unknown, eventId: unknown) {
      beginBoundary("T120.readPlan", this, planObservation);
      const result = currentReplayEvents.find((event) =>
        event.id === eventId &&
        event.type === "agent.resident-plan.recorded.v2"
      );
      if (result !== undefined) trace.push(`T120.readback:${result.id}`);
      return await finishBoundary(result);
    },
    async readObservation(this: unknown, eventId: unknown) {
      beginBoundary("T120.readObservation", this, planObservation);
      const result = currentReplayEvents.find((event) =>
        event.id === eventId &&
        event.type === "agent.resident-observation.recorded.v2"
      );
      if (result !== undefined) trace.push(`T120.readback:${result.id}`);
      return await finishBoundary(result);
    },
    async readToolStep(this: unknown, eventId: unknown) {
      beginBoundary("T120.readToolStep", this, planObservation);
      const result = currentReplayEvents.find((event) =>
        event.id === eventId &&
        event.type === "agent.resident-tool-step.recorded.v2"
      );
      if (result !== undefined) trace.push(`T120.readback:${result.id}`);
      return await finishBoundary(result);
    },
    async readSuspension(this: unknown, eventId: unknown) {
      beginBoundary("T120.readSuspension", this, planObservation);
      const result = currentReplayEvents.find((event) =>
        event.id === eventId &&
        event.type === "agent.resident-loop.suspended.v2"
      );
      if (result !== undefined) trace.push(`T120.readback:${result.id}`);
      return await finishBoundary(result);
    }
  });

  const candidateProvider = Object.freeze({
    async createInitialCandidate(this: unknown, input: unknown) {
      beginBoundary("C.createInitialCandidate", this, candidateProvider);
      const expectedInput = {
        proposedPlan,
        providerPosture,
        policyConstraints
      };
      if (!sameCanonical(input, expectedInput)) {
        throw new Error("candidate input mismatch");
      }
      return await finishBoundary(canonicalInitialCandidate);
    },
    async createReplanCandidate(this: unknown, input: unknown) {
      beginBoundary("C.createReplanCandidate", this, candidateProvider);
      if (mutation === "prior-process-candidate-cache") {
        throw new Error("prior-process candidate cache is forbidden");
      }
      const expectedInput = {
        priorPlan: replanCandidate.priorPlan,
        priorPlanReadback: replanCandidate.priorPlanReadback,
        replanObservationReadback: replanCandidate.replanObservationReadback,
        proposedPlan: replanCandidate.proposedPlan
      };
      if (!sameCanonical(input, expectedInput)) {
        throw new Error("replan candidate input is not exact durable replay");
      }
      return await finishBoundary(replanCandidate);
    }
  });

  const logicalLocator = deepFreeze({
    workspaceId: binding.workspaceId,
    residentAgentId: binding.residentAgentId,
    taskId: binding.taskId,
    attemptId: binding.attemptId,
    runId: binding.runId,
    planId: "plan_bounded_1",
    planRevision: 0,
    stepOrdinal: 1,
    toolRequestId: "toolreq_bounded_harness",
    toolId: plannedTool.toolId,
    toolVersion: plannedTool.toolVersion,
    executionCapabilityHash: hash("9")
  });
  const replanLogicalLocator = deepFreeze({
    ...logicalLocator,
    planId: "plan_bounded_2",
    planRevision: 1,
    toolRequestId: "toolreq_bounded_replan"
  });
  const requested = deepFreeze({
    authorizationKind: humanBranch ? "human-approval" : "automatic-policy",
    stage: "requested",
    logicalLocator,
    executionCapabilityHash: hash("9"),
    requestEventId: "evt_gateway_request"
  });
  const requestedReread = deepFreeze({ ...requested });
  const approved = deepFreeze({
    ...requested,
    stage: "human-approved",
    decisionEventId: "evt_gateway_decision",
    approvedBy: "human_bounded_reviewer",
    approvedPreviewHash: gatewayPreviewHash
  });
  const approvedReread = deepFreeze({ ...approved });
  const replanRequested = deepFreeze({
    authorizationKind: "automatic-policy",
    stage: "requested",
    logicalLocator: replanLogicalLocator,
    executionCapabilityHash: hash("9"),
    requestEventId: "evt_gateway_request_replan"
  });
  const claimed = deepFreeze({
    ...requested,
    stage: "claimed",
    ...(humanBranch ? {
      decisionEventId: approved.decisionEventId,
      approvedBy: approved.approvedBy,
      approvedPreviewHash: approved.approvedPreviewHash
    } : {}),
    executionClaimEventId: "evt_gateway_claim",
    category: "effect-outcome-unknown"
  });
  const claimedReread = deepFreeze({ ...claimed });
  const completedReread = deepFreeze({
    ...approved,
    stage: "completed",
    executionClaimEventId: "evt_gateway_claim",
    outcomeReceiptEventId: "evt_gateway_receipt",
    resultEventId: "evt_gateway_result"
  });
  const deniedReread = deepFreeze({
    ...requested,
    stage: "denied",
    denialEventId: "evt_gateway_denial"
  });
  const failedReread = deepFreeze({
    ...requested,
    stage: "failed",
    failurePhase: "pre-approval",
    resultEventId: "evt_gateway_failure"
  });
  const approvalRereads: Readonly<
    Record<ApprovalRereadStage, Readonly<Record<string, unknown>>>
  > = Object.freeze({
    requested: requestedReread,
    "human-approved": approvedReread,
    claimed: claimedReread,
    completed: completedReread,
    denied: deniedReread,
    failed: failedReread
  });
  const replanCompleted = deepFreeze({
    ...replanRequested,
    stage: "completed",
    executionClaimEventId: "evt_gateway_claim_replan",
    outcomeReceiptEventId: "evt_gateway_receipt_replan",
    resultEventId: "evt_gateway_result_replan"
  });
  let freshRequestUsed = false;
  let humanDecisionUsed = false;
  let missingHumanDecisionObserved = false;
  let freshExecutionUsed = false;
  let unknownExecutionClaimed = false;
  const issuedToolMaterials = new WeakMap<object, CanonicalToolStepMaterial>();
  const gateway = Object.freeze({
    async preparePlannedStepBindings(this: unknown, input: unknown) {
      beginBoundary("G.preparePlannedStepBindings", this, gateway);
      const planRevision = Reflect.get(input as object, "planRevision");
      const locator = planRevision === 1 ? replanLogicalLocator : logicalLocator;
      const expectedInput = {
        workspaceId: locator.workspaceId,
        residentAgentId: locator.residentAgentId,
        taskId: locator.taskId,
        attemptId: locator.attemptId,
        runId: locator.runId,
        planId: locator.planId,
        planRevision: locator.planRevision,
        steps: [{
          ordinal: 1,
          toolId: locator.toolId,
          toolVersion: locator.toolVersion
        }]
      };
      if (!sameCanonical(input, expectedInput)) {
        throw new Error("gateway planned-step binding input is not exact");
      }
      trace.push(
        planRevision === 1
          ? "G.preparePlannedStepBindings:replan"
          : "G.preparePlannedStepBindings:initial"
      );
      return await finishBoundary(Object.freeze([Object.freeze({
        workspaceId: locator.workspaceId,
        residentAgentId: locator.residentAgentId,
        taskId: locator.taskId,
        attemptId: locator.attemptId,
        runId: locator.runId,
        planId: locator.planId,
        planRevision: locator.planRevision,
        ordinal: locator.stepOrdinal,
        toolRequestId: locator.toolRequestId,
        toolId: locator.toolId,
        toolVersion: locator.toolVersion,
        executionCapabilityHash: locator.executionCapabilityHash
      })]));
    },
    async requestFreshAuthorized(this: unknown, input: unknown) {
      beginBoundary("G.requestFreshAuthorized", this, gateway);
      if (freshRequestUsed) throw new Error("gateway fresh request is one-shot");
      const result = sameCanonical(input, logicalLocator)
        ? requested
        : sameCanonical(input, replanLogicalLocator)
          ? replanRequested
          : undefined;
      if (result === undefined) throw new Error("gateway request locator is not exact");
      freshRequestUsed = true;
      trace.push(
        result === replanRequested
          ? "G.requestFreshAuthorized:replan"
          : "G.requestFreshAuthorized:initial"
      );
      effects.ledgerAppend += 1;
      issuedToolMaterials.set(
        result,
        result === replanRequested
          ? replanRequestedToolMaterial
          : requestedToolMaterial
      );
      return await finishBoundary(result);
    },
    async readFreshHumanDecision(this: unknown, candidate: unknown) {
      beginBoundary("G.readFreshHumanDecision", this, gateway);
      if (humanDecisionUsed || candidate !== requested) {
        throw new Error("human decision requires the exact fresh request");
      }
      humanDecisionUsed = true;
      issuedToolMaterials.delete(requested);
      if (branch === "approval-required") {
        missingHumanDecisionObserved = true;
        await finishBoundary(undefined);
        throw new Error("no durable human decision is available");
      }
      effects.approvalConsumption += 1;
      return await finishBoundary(approved);
    },
    async executeFreshAuthorized(this: unknown, authorized: unknown) {
      beginBoundary("G.executeFreshAuthorized", this, gateway);
      const resumedExecution = authorized === replanRequested;
      const allowedInitialAuthorization =
        branch === "effect-outcome-unknown-human"
          ? authorized === approved
          : branch === "effect-outcome-unknown-automatic" && authorized === requested;
      if (freshExecutionUsed || (!resumedExecution && !allowedInitialAuthorization)) {
        throw new Error("gateway execution requires the exact fresh authorization");
      }
      freshExecutionUsed = true;
      if (typeof authorized === "object" && authorized !== null) {
        issuedToolMaterials.delete(authorized);
      }
      effects.gatewayInvocation += 1;
      effects.provider += 1;
      trace.push(
        resumedExecution
          ? "G.executeFreshAuthorized:replan"
          : "G.executeFreshAuthorized:initial"
      );
      const authorization = resumedExecution ? replanRequested : requested;
      const unknown = !resumedExecution && branch.startsWith("effect-outcome-unknown");
      effects.ledgerAppend += unknown ? 1 : 3;
      if (unknown) {
        unknownExecutionClaimed = true;
        await Promise.resolve();
        awaitPending = true;
        throw new Error("domain effect outcome is unknown after durable claim");
      }
      issuedToolMaterials.set(replanCompleted, replanCompletedToolMaterial);
      return await finishBoundary(replanCompleted);
    },
    async rereadAndIssueFromLedger(this: unknown, input: unknown) {
      beginBoundary("G.rereadAndIssueFromLedger", this, gateway);
      if (!sameCanonical(input, logicalLocator)) {
        throw new Error("gateway replay locator is not exact");
      }
      const shouldRereadApproval =
        branch === "approval-required" && missingHumanDecisionObserved;
      if (!shouldRereadApproval && branch !== "resume" && !unknownExecutionClaimed) {
        throw new Error("gateway claim is not durably available for reread");
      }
      if (mutation === "prior-process-gateway-permit") {
        return await finishBoundary(Object.freeze({
          ...claimed,
          executable: true
        }));
      }
      const reread = shouldRereadApproval
        ? approvalRereads[approvalRereadStage]
        : claimed;
      const material = shouldRereadApproval
        ? approvalRereadToolMaterials[approvalRereadStage]
        : claimedToolMaterial;
      if (material !== undefined) issuedToolMaterials.set(reread, material);
      const rereadStage = String(Reflect.get(reread, "stage"));
      trace.push(
        `G.rereadAndIssueFromLedger:${rereadStage}`
      );
      return await finishBoundary(reread);
    },
    readCanonicalToolStepMaterial(this: unknown, issuedReadback: unknown) {
      beginBoundary("G.readCanonicalToolStepMaterial", this, gateway);
      if (typeof issuedReadback !== "object" || issuedReadback === null) {
        throw new Error("gateway tool-step material requires an exact issued readback");
      }
      const material = issuedToolMaterials.get(issuedReadback);
      if (material === undefined) {
        throw new Error("gateway tool-step material rejects copied or ineligible readback");
      }
      trace.push(
        `G.readCanonicalToolStepMaterial:${String(
          Reflect.get(issuedReadback, "stage")
        )}`
      );
      return material;
    }
  });

  const resumeLocator = deepFreeze({
    taskId: binding.taskId,
    attemptId: binding.attemptId,
    runId: mutation === "cross-run-anchor" ? "run_bounded_other" : binding.runId,
    checkpointSemanticKey: "resident-suspension-task_bounded_harness"
  });
  const suspensionPayload = suspension.payload as Readonly<Record<string, unknown>>;
  const suspensionCheckpoint =
    suspensionPayload.checkpoint as Readonly<Record<string, unknown>>;
  const expectedCheckpointCandidate = (
    semanticKeys: SuspensionSemanticKeys
  ) => deepFreeze({
    taskId: binding.taskId,
    runType: binding.runMode,
    attemptId: binding.attemptId,
    retryGeneration: binding.retryGeneration,
    checkpointKind: "resident-loop-suspension",
    checkpointedAt: "2026-07-28T12:00:00.000Z",
    runId: binding.runId,
    resumeIdempotencyKey: "resident-suspension-task_bounded_harness",
    contextBindings: [],
    residentLoopSuspension: {
      schemaVersion: "resident-loop-suspension-instruction.v1",
      residentAgentId: binding.residentAgentId,
      taskId: binding.taskId,
      attemptId: binding.attemptId,
      runId: binding.runId,
      planRecordEventId: planEvent.id,
      finalObservationEventId: finalObservationEvent.id,
      suspensionCategory: suspensionPayload.suspensionCategory,
      requestEventId: suspensionCheckpoint.requestEventId,
      resumptionDeadlineAt: suspensionCheckpoint.resumptionDeadlineAt,
      nextSafeAction: suspensionCheckpoint.nextSafeAction,
      suspensionSemanticKey: semanticKeys.suspensionSemanticKey,
      resultSemanticKey: semanticKeys.resultSemanticKey,
      ...(branch.startsWith("effect-outcome-unknown") ? {
        logicalLocator,
        ...(branch === "effect-outcome-unknown-human" ? {
          decisionEventId: approved.decisionEventId,
          approvedBy: approved.approvedBy,
          approvedPreviewHash: approved.approvedPreviewHash
        } : {}),
        executionClaimEventId: "evt_gateway_claim",
        executionCapabilityHash: hash("9")
      } : {})
    },
    safeNextActions: [suspensionCheckpoint.nextSafeAction]
  });
  let issuedSuspensionSemanticKeys: SuspensionSemanticKeys | undefined;

  const mountedAuthority = Object.freeze({
    async reverifyAfterAwait(this: unknown, token: unknown) {
      if (this !== mountedAuthority || token !== activeToken) {
        throw new Error("W currentness token is not the exact issued token");
      }
      activeToken = undefined;
      trace.push("W.reverifyAfterAwait");
      awaitPending = false;
      return Object.freeze({ kind: "current", token: issueToken() });
    },
    async suspendAndRelease(this: unknown, input: unknown, token: unknown) {
      beginBoundary("W.suspendAndRelease", this, mountedAuthority);
      if (token !== activeToken) {
        throw new Error("W suspension requires current authority");
      }
      const semanticKeys = suspensionKeysFromCheckpointCandidate(input);
      if (
        semanticKeys === undefined ||
        !sameCanonical(input, expectedCheckpointCandidate(semanticKeys))
      ) {
        throw new Error("W suspension checkpoint candidate is not exact");
      }
      if (
        issuedSuspensionSemanticKeys !== undefined &&
        !sameCanonical(semanticKeys, issuedSuspensionSemanticKeys)
      ) {
        throw new Error("W suspension semantic keys changed for identical canonical input");
      }
      issuedSuspensionSemanticKeys = semanticKeys;
      if (!sameCanonical(currentReplayEvents, [
        planEvent,
        observationEvent,
        toolStepEvent,
        finalObservationEvent
      ])) {
        throw new Error("W suspension requires the exact appended durable prefix");
      }
      activeToken = undefined;
      effects.ledgerAppend += 4;
      trace.push("W.internal.completeOrValidateClaim");
      trace.push("W.internal.T120.appendSuspension");
      trace.push("W.internal.T120.appendResult");
      if (branch !== "resume") {
        resumableResult = residentResult(
          branch === "approval-required"
            ? "approval-required"
            : "effect-outcome-unknown",
          resumableResultBudget,
          false,
          planEvent,
          finalObservationEvent,
          authorityBinding,
          undefined,
          semanticKeys.resultSemanticKey
        );
        expectedResult = resumableResult;
      }
      currentReplayEvents = [...currentReplayEvents, suspension, resumableResult];
      await Promise.resolve();
      return releasedCheckpointReadback;
    },
    async recoverSuspensionPrefix(this: unknown, locator: unknown) {
      beginBoundary("W.recoverSuspensionPrefix", this, mountedAuthority);
      activeToken = undefined;
      if (!sameResumeLocator(locator, binding)) throw new Error("W recovery locator mismatch");
      if ([
        "missing-suspension",
        "deadline-mismatch",
        "next-safe-action-mismatch",
        "category-mismatch",
        "receipt-on-unknown-claim",
        "terminal-on-unknown-claim",
        "burned-tool-request-reuse"
      ].includes(mutation)) {
        throw new Error("W recovery rejects a non-canonical durable suspension prefix");
      }
      await Promise.resolve();
      return Object.freeze({
        schemaVersion: "resident-loop-released-checkpoint-readback.v1",
        checkpointEventId: "evt_orchestration_checkpoint",
        suspensionEventId: suspension.id,
        resultEventId: currentReplayEvents.at(-1)?.id,
        releaseEventId: "evt_orchestration_release"
      });
    },
    async reclaimAndReverify(this: unknown, anchor: unknown) {
      beginBoundary("W.reclaimAndReverify", this, mountedAuthority);
      if (!sameResumeLocator(anchor, binding)) {
        throw new Error("W reclaim anchor mismatch");
      }
      await Promise.resolve();
      if (mutation === "failed-reclaim") return null;
      effects.ledgerAppend += 1;
      return issueToken();
    }
  });

  const handoffProjection = Object.freeze({
    async readFull(this: unknown, input: unknown) {
      beginBoundary("H.readFull", this, handoffProjection);
      if (!sameHandoffInput(input, binding, authorityBinding)) {
        throw new Error("H full-readback input mismatch");
      }
      return await finishBoundary(handoffReadback(mutation, binding, authorityBinding));
    }
  });

  const resumeInput = deepFreeze({
    ...resumeLocator,
    proposedPlan: replanCandidate.proposedPlan
  });

  function positionalArguments(): unknown[] {
    return [
      planObservation,
      candidateProvider,
      gateway,
      mountedAuthority,
      issuerToken,
      handoffProjection,
      metadata,
      () => 10
    ];
  }

  async function exercisePositiveControl(): Promise<void> {
    const identity = deepFreeze({
      residentAgentId: binding.residentAgentId,
      workspaceId: binding.workspaceId,
      taskId: binding.taskId,
      attemptId: binding.attemptId,
      runId: binding.runId
    });
    const nextToken = async (token: object): Promise<object> => {
      const revalidated = await mountedAuthority.reverifyAfterAwait(token);
      if (revalidated.kind !== "current") {
        throw new Error("positive control lost mounted currentness");
      }
      return revalidated.token;
    };

    if (branch === "resume") {
      await mountedAuthority.recoverSuspensionPrefix(resumeLocator);
      let token = await mountedAuthority.reclaimAndReverify(resumeLocator);
      if (token === undefined || token === null) {
        throw new Error("resume positive control did not reclaim");
      }
      const readback = await planObservation.readReplay(identity);
      token = await nextToken(token);
      if (!sameCanonical(readback, replay())) {
        throw new Error("resume positive control did not reread the durable prefix");
      }
      const replayed = await gateway.rereadAndIssueFromLedger(logicalLocator);
      token = await nextToken(token);
      if (Reflect.get(replayed, "stage") !== "claimed") {
        throw new Error("resume positive control did not reissue durable G state");
      }
      if (!sameCanonical(
        gateway.readCanonicalToolStepMaterial(replayed),
        claimedToolMaterial
      )) throw new Error("resume positive control lost old G material");

      const recovery = await planObservation.appendObservation(recoveryObservationEvent.payload);
      token = await nextToken(token);
      await planObservation.readObservation(recovery.id);
      token = await nextToken(token);
      const created = await candidateProvider.createReplanCandidate({
        priorPlan: replanCandidate.priorPlan,
        priorPlanReadback: replanCandidate.priorPlanReadback,
        replanObservationReadback: replanCandidate.replanObservationReadback,
        proposedPlan: replanCandidate.proposedPlan
      });
      token = await nextToken(token);
      if (!sameCanonical(created, replanCandidate)) {
        throw new Error("resume positive control did not reconstruct C from replay");
      }
      const bindings = await gateway.preparePlannedStepBindings({
        workspaceId: binding.workspaceId,
        residentAgentId: binding.residentAgentId,
        taskId: binding.taskId,
        attemptId: binding.attemptId,
        runId: binding.runId,
        planId: replanLogicalLocator.planId,
        planRevision: replanLogicalLocator.planRevision,
        steps: [{
          ordinal: 1,
          toolId: replanLogicalLocator.toolId,
          toolVersion: replanLogicalLocator.toolVersion
        }]
      });
      token = await nextToken(token);
      if (bindings.length !== 1) throw new Error("resume positive control lost G binding");
      const replan = await planObservation.appendPlan(replanPlanEvent.payload);
      token = await nextToken(token);
      await planObservation.readPlan(replan.id);
      token = await nextToken(token);
      const observed = await planObservation.appendObservation(resumeObservationEvent.payload);
      token = await nextToken(token);
      await planObservation.readObservation(observed.id);
      token = await nextToken(token);
      const request = await gateway.requestFreshAuthorized(replanLogicalLocator);
      token = await nextToken(token);
      if (!sameCanonical(
        gateway.readCanonicalToolStepMaterial(request),
        replanRequestedToolMaterial
      )) throw new Error("resume positive control lost requested G material");
      const completed = await gateway.executeFreshAuthorized(request);
      token = await nextToken(token);
      const completedMaterial = gateway.readCanonicalToolStepMaterial(completed);
      if (!sameCanonical(completedMaterial, replanCompletedToolMaterial)) {
        throw new Error("resume positive control lost completed G material");
      }
      const tool = await planObservation.appendToolStep(resumeToolStepEvent.payload);
      token = await nextToken(token);
      await planObservation.readToolStep(tool.id);
      token = await nextToken(token);
      const finalObservation =
        await planObservation.appendObservation(resumeFinalObservationEvent.payload);
      token = await nextToken(token);
      await planObservation.readObservation(finalObservation.id);
      token = await nextToken(token);
      const full = await handoffProjection.readFull(deepFreeze({
        taskId: binding.taskId,
        runId: binding.runId,
        authorityBinding
      }));
      token = await nextToken(token);
      if (full === undefined) throw new Error("resume positive control lost H readback");
      const result = await planObservation.appendResult(resumeTerminalResult.payload);
      token = await nextToken(token);
      const resultReadback = await planObservation.readResult(result.id);
      await nextToken(token);
      if (!sameCanonical(resultReadback, resumeTerminalResult)) {
        throw new Error("resume positive control lost terminal readback");
      }
      assertValidResidentReplayFixture(currentReplayEvents);
      if (currentReplayEvents.length !== 12) {
        throw new Error("resume positive control did not complete all twelve events");
      }
    } else {
      assertValidResidentReplayFixture(
        replayEvents.length > 0
          ? replayEvents
          : [
              planEvent,
              observationEvent,
              toolStepEvent,
              finalObservationEvent,
              suspension,
              expectedResult
            ]
      );
      const readback = await planObservation.readReplay(identity);
      let token = await nextToken(issuerToken);
      const created = await candidateProvider.createInitialCandidate({
        proposedPlan,
        providerPosture,
        policyConstraints
      });
      token = await nextToken(token);
      const bindings = await gateway.preparePlannedStepBindings({
        workspaceId: binding.workspaceId,
        residentAgentId: binding.residentAgentId,
        taskId: binding.taskId,
        attemptId: binding.attemptId,
        runId: binding.runId,
        planId: proposedPlan.planId,
        planRevision: proposedPlan.planRevision,
        steps: proposedPlan.steps.map((step) => ({
          ordinal: step.ordinal,
          toolId: step.toolId,
          toolVersion: step.toolVersion
        }))
      });
      token = await nextToken(token);
      if (
        !sameCanonical(readback, replay()) ||
        !sameCanonical(created, canonicalInitialCandidate) ||
        bindings.length !== 1
      ) throw new Error("issued-capability positive control failed");
      if (branch === "completed") {
        const full = await handoffProjection.readFull(deepFreeze({
          taskId: binding.taskId,
          runId: binding.runId,
          authorityBinding
        }));
        await nextToken(token);
        if (full === undefined) throw new Error("completion positive control lost H");
      } else {
      await planObservation.appendPlan(planEvent.payload);
      token = await nextToken(token);
      await planObservation.readPlan(planEvent.id);
      token = await nextToken(token);
      await planObservation.appendObservation(observationEvent.payload);
      token = await nextToken(token);
      await planObservation.readObservation(observationEvent.id);
      token = await nextToken(token);
      const request = await gateway.requestFreshAuthorized(logicalLocator);
      token = await nextToken(token);
      if (!sameCanonical(
        gateway.readCanonicalToolStepMaterial(request),
        requestedToolMaterial
      )) throw new Error("suspension positive control lost requested G material");
      let authorization = request;
      let issuedForMaterial: object = request;
      if (branch === "approval-required") {
        let decisionRejected = false;
        try {
          await gateway.readFreshHumanDecision(request);
        } catch {
          decisionRejected = true;
        }
        token = await nextToken(token);
        if (!decisionRejected) {
          throw new Error("approval suspension requires an absent durable decision");
        }
        issuedForMaterial = await gateway.rereadAndIssueFromLedger(logicalLocator);
        token = await nextToken(token);
        const issuedStage = Reflect.get(issuedForMaterial, "stage");
        if (
          issuedForMaterial === request ||
          issuedStage !== approvalRereadStage
        ) {
          throw new Error("approval reread preflight lost its exact fresh stage");
        }
        if (approvalRereadStage !== "requested") {
          if (
            awaitPending ||
            trace.at(-1) !== "W.reverifyAfterAwait" ||
            trace.filter(
              (entry) => entry === "W.reverifyAfterAwait"
            ).length !== 10 ||
            !trace.includes(
              `G.rereadAndIssueFromLedger:${approvalRereadStage}`
            ) ||
            trace.filter(
              (entry) => entry === "G.readCanonicalToolStepMaterial"
            ).length !== 1 ||
            !sameCanonical(
              trace.filter((entry) => entry.startsWith("T120.appended:")),
              [
                `T120.appended:${planEvent.id}`,
                `T120.appended:${observationEvent.id}`
              ]
            ) ||
            !sameCanonical(effects, {
              ...zeroEffects(),
              ledgerAppend: 3
            })
          ) {
            throw new Error("non-requested approval reread preflight did not fail closed");
          }
          trace.splice(0);
          Object.assign(effects, zeroEffects());
          awaitPending = false;
          return;
        }
      } else if (branch === "effect-outcome-unknown-human") {
        authorization = await gateway.readFreshHumanDecision(request);
        token = await nextToken(token);
      }
      if (branch.startsWith("effect-outcome-unknown")) {
        await gateway.executeFreshAuthorized(authorization).catch(() => undefined);
        token = await nextToken(token);
        issuedForMaterial = await gateway.rereadAndIssueFromLedger(logicalLocator);
        token = await nextToken(token);
        if (Reflect.get(issuedForMaterial, "stage") !== "claimed") {
          throw new Error("unknown effect positive control did not reread its claim");
        }
      }
      if (!sameCanonical(
        gateway.readCanonicalToolStepMaterial(issuedForMaterial),
        initialToolMaterial
      )) throw new Error("suspension positive control lost G material");
      await planObservation.appendToolStep(toolStepEvent.payload);
      token = await nextToken(token);
      await planObservation.readToolStep(toolStepEvent.id);
      token = await nextToken(token);
      await planObservation.appendObservation(finalObservationEvent.payload);
      token = await nextToken(token);
      await planObservation.readObservation(finalObservationEvent.id);
      token = await nextToken(token);
      await mountedAuthority.suspendAndRelease(
        expectedCheckpointCandidate(controlSemanticKeys),
        token
      );
      }
    }
    trace.splice(0);
    Object.assign(effects, zeroEffects());
    awaitPending = false;
  }

  return {
    metadata,
    binding,
    initialCandidate,
    resumeInput,
    get expectedResult() {
      return expectedResult;
    },
    releasedCheckpointReadback,
    effects,
    trace,
    positionalArguments,
    exercisePositiveControl,
    assertSettled() {
      expect(awaitPending, "every awaited boundary must be followed by W before continuation").toBe(false);
    },
    assertCompletionReadback() {
      expectTraceSubsequence(trace, [
        "T120.readReplay",
        "W.reverifyAfterAwait",
        "H.readFull",
        "W.reverifyAfterAwait"
      ]);
      expect(trace.filter((entry) => entry === "H.readFull")).toHaveLength(1);
      expect(trace).not.toContain("G.requestFreshAuthorized");
      expect(trace).not.toContain("G.executeFreshAuthorized");
      expect(trace.some((entry) => entry.startsWith("T120.appended:"))).toBe(false);
      expect(trace.filter((entry) => entry === "W.reverifyAfterAwait").length).toBeGreaterThanOrEqual(2);
    },
    assertSuspendedThroughWake() {
      expectTraceSubsequence(trace, [
        "T120.readReplay",
        "C.createInitialCandidate",
        "G.preparePlannedStepBindings:initial",
        `T120.appended:${planEvent.id}`,
        `T120.readback:${planEvent.id}`,
        `T120.appended:${observationEvent.id}`,
        `T120.readback:${observationEvent.id}`,
        "G.requestFreshAuthorized:initial",
        `G.readCanonicalToolStepMaterial:${
          branch === "approval-required" ? "requested" : "claimed"
        }`,
        `T120.appended:${toolStepEvent.id}`,
        `T120.readback:${toolStepEvent.id}`,
        `T120.appended:${finalObservationEvent.id}`,
        `T120.readback:${finalObservationEvent.id}`,
        "W.suspendAndRelease"
      ]);
      expect(trace).toContain("W.internal.T120.appendSuspension");
      expect(trace).toContain("W.internal.T120.appendResult");
      expect(trace).toContain("W.internal.completeOrValidateClaim");
      expect(trace).not.toContain("T120.appendSuspension");
      expect(trace).not.toContain("T120.appendResult");
      expect(trace).not.toContain("H.readFull");
      expect(trace.filter((entry) => entry === "G.preparePlannedStepBindings")).toHaveLength(1);
      expect(trace.filter((entry) => entry === "G.requestFreshAuthorized")).toHaveLength(1);
      expect(trace.filter((entry) => entry === "W.suspendAndRelease")).toHaveLength(1);
      if (branch === "approval-required") {
        expectTraceSubsequence(trace, [
          "G.requestFreshAuthorized:initial",
          "G.readCanonicalToolStepMaterial:requested",
          "G.readFreshHumanDecision",
          "W.reverifyAfterAwait",
          "G.rereadAndIssueFromLedger",
          "G.rereadAndIssueFromLedger:requested",
          "W.reverifyAfterAwait",
          "G.readCanonicalToolStepMaterial:requested",
          `T120.appended:${toolStepEvent.id}`
        ]);
        expect(trace).not.toContain("G.executeFreshAuthorized");
      } else {
        expectTraceSubsequence(trace, [
          "G.requestFreshAuthorized:initial",
          ...(branch === "effect-outcome-unknown-human"
            ? ["G.readFreshHumanDecision"] as const
            : []),
          "G.executeFreshAuthorized:initial",
          "W.reverifyAfterAwait",
          "G.rereadAndIssueFromLedger",
          "W.reverifyAfterAwait",
          `T120.appended:${toolStepEvent.id}`
        ]);
        expect(trace.filter((entry) => entry === "G.executeFreshAuthorized")).toHaveLength(1);
        expect(trace.filter((entry) => entry === "G.rereadAndIssueFromLedger")).toHaveLength(1);
      }
      expect(trace.filter((entry) => entry === "G.readFreshHumanDecision")).toHaveLength(
        humanBranch ? 1 : 0
      );
      expect(trace.filter((entry) => entry === "G.rereadAndIssueFromLedger")).toHaveLength(1);
      expect(effects).toEqual({
        ...zeroEffects(),
        provider: branch === "approval-required" ? 0 : 1,
        gatewayInvocation: branch === "approval-required" ? 0 : 1,
        approvalConsumption: branch === "effect-outcome-unknown-human" ? 1 : 0,
        ledgerAppend: branch === "approval-required" ? 9 : 10
      });
      assertValidResidentReplayFixture(currentReplayEvents);
      const semanticKeys = issuedSuspensionSemanticKeys;
      expect(semanticKeys).toBeDefined();
      expect(semanticKeys?.suspensionSemanticKey).not.toBe(
        semanticKeys?.resultSemanticKey
      );
      expect(
        (resumableResult.payload as Readonly<Record<string, unknown>>).resultHash
      ).toBe(semanticKeys?.resultSemanticKey);
      expect(releasedCheckpointReadback.resultEventId).toBe(resumableResult.id);
      expect(
        currentReplayEvents.find((event) =>
          event.id === releasedCheckpointReadback.resultEventId &&
          event.type === "agent.resident-loop.result.recorded.v2"
        )
      ).toBe(resumableResult);
      expect(currentReplayEvents.map((event) => event.id)).toEqual([
        planEvent.id,
        observationEvent.id,
        toolStepEvent.id,
        finalObservationEvent.id,
        suspension.id,
        resumableResult.id
      ]);
    },
    assertDurableResume() {
      expectTraceSubsequence(trace, [
        "W.recoverSuspensionPrefix",
        "W.reclaimAndReverify",
        "T120.readReplay",
        "G.rereadAndIssueFromLedger",
        "G.readCanonicalToolStepMaterial:claimed",
        `T120.appended:${recoveryObservationEvent.id}`,
        `T120.readback:${recoveryObservationEvent.id}`,
        "C.createReplanCandidate",
        "G.preparePlannedStepBindings:replan",
        `T120.appended:${replanPlanEvent.id}`,
        `T120.readback:${replanPlanEvent.id}`,
        `T120.appended:${resumeObservationEvent.id}`,
        `T120.readback:${resumeObservationEvent.id}`,
        "G.requestFreshAuthorized:replan",
        "G.executeFreshAuthorized:replan",
        "G.readCanonicalToolStepMaterial:completed",
        `T120.appended:${resumeToolStepEvent.id}`,
        `T120.readback:${resumeToolStepEvent.id}`,
        `T120.appended:${resumeFinalObservationEvent.id}`,
        `T120.readback:${resumeFinalObservationEvent.id}`,
        "H.readFull",
        `T120.appended:${resumeTerminalResult.id}`,
        `T120.readback:${resumeTerminalResult.id}`
      ]);
      expect(trace).not.toContain("G.executeFreshAuthorized:initial");
      expect(trace.filter((entry) => entry === "G.rereadAndIssueFromLedger")).toHaveLength(1);
      expect(trace.filter((entry) => entry === "G.requestFreshAuthorized")).toHaveLength(1);
      expect(trace.filter((entry) => entry === "G.executeFreshAuthorized")).toHaveLength(1);
      expect(effects).toEqual({
        ...zeroEffects(),
        provider: 1,
        gatewayInvocation: 1,
        ledgerAppend: 11
      });
      assertValidResidentReplayFixture(currentReplayEvents);
      expect(currentReplayEvents.map((event) => event.id)).toEqual([
        planEvent.id,
        observationEvent.id,
        toolStepEvent.id,
        finalObservationEvent.id,
        suspension.id,
        resumableResult.id,
        recoveryObservationEvent.id,
        replanPlanEvent.id,
        resumeObservationEvent.id,
        resumeToolStepEvent.id,
        resumeFinalObservationEvent.id,
        resumeTerminalResult.id
      ]);
    },
    suspensionSemanticKeys() {
      return issuedSuspensionSemanticKeys;
    }
  };
}

function hostileCases(): readonly {
  readonly label: string;
  readonly branch?: HarnessBranch;
  readonly prepare: (
    args: unknown[],
    candidate: Readonly<Record<string, unknown>>
  ) => {
    readonly candidate: unknown;
    readonly afterInvoke?: () => void;
    readonly proxyReads: () => number;
  };
}[] {
  const replaceMetadata = (
    args: unknown[],
    mutate: (metadata: Record<string, unknown>) => void
  ) => {
    const metadata = structuredClone(args[6]) as Record<string, unknown>;
    mutate(metadata);
    args[6] = deepFreeze(metadata);
  };
  const replacePlan = (
    candidate: Readonly<Record<string, unknown>>,
    mutate: (plan: Record<string, unknown>) => void
  ): Readonly<Record<string, unknown>> => {
    const copied = structuredClone(candidate) as Record<string, unknown>;
    const plan = copied.proposedPlan as Record<string, unknown>;
    mutate(plan);
    return deepFreeze(copied);
  };
  const prepared = (
    candidate: unknown,
    options: {
      readonly afterInvoke?: () => void;
      readonly proxyReads?: () => number;
    } = {}
  ) => ({
    candidate,
    ...(options.afterInvoke === undefined ? {} : { afterInvoke: options.afterInvoke }),
    proxyReads: options.proxyReads ?? (() => 0)
  });
  return [
    {
      label: "accessor",
      prepare(args, candidate) {
        let reads = 0;
        args[6] = Object.create(Object.prototype, {
          residentAgentId: {
            enumerable: true,
            get() {
              reads += 1;
              throw new Error("accessor read");
            }
          }
        });
        return prepared(candidate, { proxyReads: () => reads });
      }
    },
    {
      label: "proxy",
      prepare(args, candidate) {
        let reads = 0;
        args[6] = new Proxy(args[6] as object, {
          get(target, property, receiver) {
            reads += 1;
            if (reads > 0) throw new Error("proxy read");
            return Reflect.get(target, property, receiver);
          }
        });
        return prepared(candidate, { proxyReads: () => reads });
      }
    },
    {
      label: "symbol",
      prepare(args, candidate) {
        args[6] = Object.freeze({ ...(args[6] as object), [Symbol("hostile")]: true });
        return prepared(candidate);
      }
    },
    {
      label: "inherited-field",
      prepare(args, candidate) {
        args[6] = Object.assign(Object.create({ extra: true }), args[6]);
        return prepared(candidate);
      }
    },
    {
      label: "unsafe-prototype",
      prepare(args, candidate) {
        args[6] = Object.assign(Object.create(null), args[6]);
        return prepared(candidate);
      }
    },
    {
      label: "own-prototype-data",
      prepare(args, candidate) {
        const metadata = structuredClone(args[6]) as Record<string, unknown>;
        Object.defineProperty(metadata, "__proto__", {
          value: deepFreeze({ marker: "abstract-local" }),
          enumerable: true,
          configurable: true,
          writable: true
        });
        args[6] = deepFreeze(metadata);
        return prepared(candidate);
      }
    },
    {
      label: "sparse-array",
      prepare(_args, candidate) {
        return prepared(replacePlan(candidate, (plan) => {
          const sparse = new Array(2);
          sparse[1] = "evt_source_bounded_2";
          plan.sourceEventIds = sparse;
        }));
      }
    },
    {
      label: "custom-array",
      prepare(_args, candidate) {
        return prepared(replacePlan(candidate, (plan) => {
          const custom = ["evt_source_bounded_2"];
          Object.setPrototypeOf(custom, { custom: true });
          plan.sourceEventIds = custom;
        }));
      }
    },
    {
      label: "post-call-mutation",
      prepare(_args, candidate) {
        const mutable = structuredClone(candidate) as Record<string, unknown>;
        return prepared(mutable, {
          afterInvoke() {
            (mutable.proposedPlan as Record<string, unknown>).planId =
              "plan_bounded_changed_after_invocation";
          }
        });
      }
    },
    {
      label: "unknown-key",
      prepare(args, candidate) {
        replaceMetadata(args, (metadata) => { metadata.extra = true; });
        return prepared(candidate);
      }
    },
    {
      label: "unsafe-text",
      prepare(args, candidate) {
        replaceMetadata(args, (metadata) => {
          (metadata.workspace as Record<string, unknown>).workspaceId = "https://unsafe.example";
        });
        return prepared(candidate);
      }
    },
    ...([
      ["workspace", "workspace", "workspaceId", "ws_bounded_other"],
      ["resident", undefined, "residentAgentId", "agent_other"],
      ["task", "run", "taskId", "task_bounded_other"],
      ["attempt", "run", "attemptId", foreignAttemptId],
      ["run", "run", "runId", "run_bounded_other"]
    ] as const).map(([label, parent, key, value]) => ({
      label,
      prepare(args: unknown[], candidate: Readonly<Record<string, unknown>>) {
        replaceMetadata(args, (metadata) => {
          const target = parent === undefined
            ? metadata
            : metadata[parent] as Record<string, unknown>;
          target[key] = value;
        });
        return prepared(candidate);
      }
    })),
    {
      label: "descriptor",
      prepare(_args, candidate) {
        return prepared(replacePlan(candidate, (plan) => {
          const steps = plan.steps as Record<string, unknown>[];
          steps[0]!.toolId = "unapproved.tool";
        }));
      }
    },
    {
      label: "policy",
      prepare(args, candidate) {
        replaceMetadata(args, (metadata) => {
          (metadata.workspace as Record<string, unknown>).policyDigest = hash("0");
        });
        return prepared(candidate);
      }
    },
    {
      label: "authority",
      prepare(_args, candidate) {
        return prepared(replacePlan(candidate, (plan) => {
          plan.authority = { forged: true };
        }));
      }
    },
    {
      label: "source",
      prepare(_args, candidate) {
        return prepared(replacePlan(candidate, (plan) => {
          plan.sourceEventIds = ["evt_foreign"];
        }));
      }
    },
    {
      label: "context",
      prepare(_args, candidate) {
        return prepared(replacePlan(candidate, (plan) => {
          plan.contextPackRefs = [{
            contextPackId: "context_pack_foreign",
            contentHash: hash("0")
          }];
        }));
      }
    },
    {
      label: "correlation",
      prepare(_args, candidate) {
        return prepared(replacePlan(candidate, (plan) => {
          plan.correlationId = "corr_foreign";
        }));
      }
    },
    {
      label: "plan",
      prepare(_args, candidate) {
        return prepared(replacePlan(candidate, (plan) => {
          plan.planId = "plan_foreign";
        }));
      }
    },
    {
      label: "revision",
      prepare(_args, candidate) {
        return prepared(replacePlan(candidate, (plan) => {
          plan.planRevision = 3;
        }));
      }
    },
    {
      label: "readback",
      prepare(_args, candidate) {
        return prepared(replacePlan(candidate, (plan) => {
          plan.priorPlanReadback = { forged: true };
        }));
      }
    },
    {
      label: "fabricated-capability",
      branch: "approval-required",
      prepare(args, candidate) {
        args[2] = Object.freeze({ ...(args[2] as object) });
        return prepared(candidate);
      }
    },
    {
      label: "swapped-capability",
      prepare(args, candidate) {
        args[3] = createIssuedCapabilityHarness().positionalArguments()[3];
        return prepared(candidate);
      }
    },
    {
      label: "stale-capability",
      prepare(args, candidate) {
        args[4] = Object.freeze({
          schemaVersion: "resident-loop-currentness-token.v1",
          serial: 999
        });
        return prepared(candidate);
      }
    }
  ];
}

function handoffReadback(
  mutation: HarnessMutation,
  binding: Readonly<Record<string, unknown>>,
  authorityBinding: Readonly<Record<string, unknown>>
): Readonly<Record<string, unknown>> | undefined {
  if (mutation === "missing-full-readback") return undefined;
  const taskId = mutation === "cross-task-readback" ? "task_bounded_other" : binding.taskId;
  const runId = mutation === "cross-run-readback" ? "run_bounded_other" : binding.runId;
  const selectedReadback = specialistHandoffReadback(
    mutation === "selected-readback-mismatch" ? "handoff_other" : "handoff_bounded",
    taskId,
    runId,
    mutation === "cross-authority-readback"
      ? { ...authorityBinding, policyHash: hash("0") }
      : authorityBinding,
    {
      recordedEventId: mutation === "missing-recorded-event" ? "" : "evt_handoff_recorded",
      terminalRunEventId: mutation === "missing-terminal-event" ? "" : "evt_run_terminal",
      taskStatusEventId: mutation === "missing-task-status-event" ? "" : "evt_task_status"
    }
  );
  const selectedHandoff = deepFreeze({
    schemaVersion: "agent-specialist-handoff.v1",
    handoffId: "handoff_bounded",
    handoffRevision: 1,
    runType: "evidence-triage",
    runId,
    taskId,
    residentAgentId: "agent_default",
    generatedAt: "2026-07-28T12:00:00.000Z",
    status: "ready-for-review",
    safeSummary: "The bounded resident run produced a verified handoff.",
    contextPackRefs: [],
    outputArtifacts: [],
    toolRequestIds: ["toolreq_bounded_harness"],
    approvalRequirements: [],
    nextSafeActions: []
  });
  return deepFreeze({
    state: mutation === "non-completed-handoff-state" ? "handoff-recorded" : "task-completed",
    handoffs: [selectedHandoff],
    selectedHandoff,
    selectedReadback,
    history: [{
      state: "task-completed",
      runId,
      taskId,
      handoffId: "handoff_bounded",
      finalOutputEventId: "evt_final_output_bounded",
      preparedEventId: "evt_handoff_prepared",
      recordedEventId: "evt_handoff_recorded",
      eventIds: [
        "evt_final_output_bounded",
        "evt_handoff_prepared",
        "evt_handoff_recorded",
        "evt_run_terminal",
        "evt_task_status"
      ],
      artifactHashes: [hash("7")]
    }],
    diagnostics: []
  });
}

function specialistHandoffReadback(
  handoffId: string,
  taskId: unknown,
  runId: unknown,
  authorityBinding: Readonly<Record<string, unknown>>,
  eventIds: {
    readonly recordedEventId: string;
    readonly terminalRunEventId: string;
    readonly taskStatusEventId: string;
  } = {
    recordedEventId: "evt_handoff_recorded",
    terminalRunEventId: "evt_run_terminal",
    taskStatusEventId: "evt_task_status"
  }
): Readonly<Record<string, unknown>> {
  return deepFreeze({
    outcome: "verified",
    handoffId,
    taskId,
    runId,
    manifestSchemaVersion: "agent-specialist-handoff-manifest.v2",
    manifestHash: hash("7"),
    finalOutputStepId: "step_bounded_final_output",
    finalOutputEventId: "evt_final_output_bounded",
    preparedEventId: "evt_handoff_prepared",
    recordedEventId: eventIds.recordedEventId,
    terminalRunEventId: eventIds.terminalRunEventId,
    taskStatusEventId: eventIds.taskStatusEventId,
    authorityBinding,
    diagnostics: []
  });
}

function residentPlanEvent(
  proposedPlan: Readonly<Record<string, unknown>>,
  durableBudget: ReturnType<typeof budget>,
  options: {
    readonly id?: string;
    readonly sequence?: number;
    readonly toolRequestId?: string;
  } = {}
): Readonly<Record<string, unknown>> {
  const steps = proposedPlan.steps as readonly Readonly<Record<string, unknown>>[];
  return residentEvent(
    "agent.resident-plan.recorded.v2",
    {
      ...proposedPlan,
      budget: durableBudget,
      steps: steps.map((step, index) => ({
        ...step,
        toolRequestId: index === 0
          ? options.toolRequestId ?? "toolreq_bounded_harness"
          : `toolreq_bounded_harness_${index + 1}`,
        executionCapabilityHash: hash("9")
      }))
    },
    options.id ?? "evt_plan_bounded_1",
    options.sequence ?? 1
  );
}

function planReadbackFor(
  planEvent: Readonly<Record<string, unknown>>
): Readonly<Record<string, unknown>> {
  const payload = Reflect.get(planEvent, "payload") as Readonly<Record<string, unknown>>;
  return deepFreeze({
    planRecordEventId: planEvent.id,
    workspaceId: payload.workspaceId,
    residentAgentId: payload.residentAgentId,
    taskId: payload.taskId,
    attemptId: payload.attemptId,
    runId: payload.runId,
    planId: payload.planId,
    planRevision: payload.planRevision
  });
}

function residentObservationEvent(
  planEvent: Readonly<Record<string, unknown>>,
  durableBudget: ReturnType<typeof budget>,
  options: {
    readonly id?: string;
    readonly sequence?: number;
    readonly observationId?: string;
  } = {}
): Readonly<Record<string, unknown>> {
  const plan = Reflect.get(planEvent, "payload") as Readonly<Record<string, unknown>>;
  return residentEvent(
    "agent.resident-observation.recorded.v2",
    {
      schemaVersion: "resident-observation-record.v2",
      residentAgentId: plan.residentAgentId,
      workspaceId: plan.workspaceId,
      taskId: plan.taskId,
      attemptId: plan.attemptId,
      runId: plan.runId,
      runMode: plan.runMode,
      workflowDescriptor: plan.workflowDescriptor,
      policy: plan.policy,
      authority: plan.authority,
      sourceEventIds: plan.sourceEventIds,
      contextPackRefs: plan.contextPackRefs,
      budget: durableBudget,
      causationId: planEvent.id,
      correlationId: plan.correlationId,
      observationId: options.observationId ?? "observation_bounded_1",
      planId: plan.planId,
      planRevision: plan.planRevision,
      planReadback: planReadbackFor(planEvent),
      stepOrdinal: 1,
      kind: "context-verified",
      safeSummary: "The bounded resident fixture is ready.",
      artifactHashes: [hash("f")]
    },
    options.id ?? "evt_observation_bounded_1",
    options.sequence ?? 2
  );
}

function observationReadbackFor(
  observationEvent: Readonly<Record<string, unknown>>
): Readonly<Record<string, unknown>> {
  const payload = Reflect.get(observationEvent, "payload") as Readonly<Record<string, unknown>>;
  return deepFreeze({
    observationEventId: observationEvent.id,
    workspaceId: payload.workspaceId,
    residentAgentId: payload.residentAgentId,
    taskId: payload.taskId,
    attemptId: payload.attemptId,
    runId: payload.runId,
    planId: payload.planId,
    planRevision: payload.planRevision
  });
}

function residentRecoveryObservationEvent(
  planEvent: Readonly<Record<string, unknown>>,
  resumableResult: Readonly<Record<string, unknown>>,
  durableBudget: ReturnType<typeof budget>
): Readonly<Record<string, unknown>> {
  const plan = Reflect.get(planEvent, "payload") as Readonly<Record<string, unknown>>;
  return residentEvent(
    "agent.resident-observation.recorded.v2",
    {
      schemaVersion: "resident-observation-record.v2",
      residentAgentId: plan.residentAgentId,
      workspaceId: plan.workspaceId,
      taskId: plan.taskId,
      attemptId: plan.attemptId,
      runId: plan.runId,
      runMode: plan.runMode,
      workflowDescriptor: plan.workflowDescriptor,
      policy: plan.policy,
      authority: plan.authority,
      sourceEventIds: plan.sourceEventIds,
      contextPackRefs: plan.contextPackRefs,
      budget: durableBudget,
      causationId: resumableResult.id,
      correlationId: plan.correlationId,
      observationId: "observation_bounded_recovery",
      planId: plan.planId,
      planRevision: plan.planRevision,
      planReadback: planReadbackFor(planEvent),
      stepOrdinal: 1,
      kind: "recovery",
      safeSummary: "The durable suspension prefix was recovered.",
      artifactHashes: []
    },
    "evt_observation_bounded_recovery",
    7
  );
}

function residentToolStepEvent(
  planEvent: Readonly<Record<string, unknown>>,
  observationEvent: Readonly<Record<string, unknown>>,
  durableBudget: ReturnType<typeof budget>,
  material: CanonicalToolStepMaterial,
  options: {
    readonly id?: string;
    readonly sequence?: number;
    readonly toolRequestId?: string;
  } = {}
): Readonly<Record<string, unknown>> {
  const plan = Reflect.get(planEvent, "payload") as Readonly<Record<string, unknown>>;
  const steps = plan.steps as readonly Readonly<Record<string, unknown>>[];
  const step = steps[0]!;
  const gatewayReadbacks = material.gatewayReadbacks;
  const completed = gatewayReadbacks.stage === "completed";
  const causationId = completed
    ? gatewayReadbacks.resultEventId
    : gatewayReadbacks.stage === "requested"
      ? gatewayReadbacks.requestEventId
      : gatewayReadbacks.executionClaimEventId;
  return residentEvent(
    "agent.resident-tool-step.recorded.v2",
    {
      schemaVersion: "resident-tool-step-record.v2",
      residentAgentId: plan.residentAgentId,
      workspaceId: plan.workspaceId,
      taskId: plan.taskId,
      attemptId: plan.attemptId,
      runId: plan.runId,
      runMode: plan.runMode,
      workflowDescriptor: plan.workflowDescriptor,
      policy: plan.policy,
      authority: plan.authority,
      sourceEventIds: plan.sourceEventIds,
      contextPackRefs: plan.contextPackRefs,
      budget: durableBudget,
      causationId,
      correlationId: plan.correlationId,
      planId: plan.planId,
      planRevision: plan.planRevision,
      planReadback: planReadbackFor(planEvent),
      stepOrdinal: 1,
      toolRequestId: options.toolRequestId ?? "toolreq_bounded_harness",
      toolId: step.toolId,
      toolVersion: step.toolVersion,
      allowlistEntryHash: material.allowlistEntryHash,
      sideEffectClass: material.sideEffectClass,
      requiredApprovalClass: material.requiredApprovalClass,
      state: completed ? "executed" : "suspended",
      previewHash: material.previewHash,
      gatewayReadbacks,
      inputArtifactHashes: material.inputArtifactHashes,
      resultArtifactHashes: material.resultArtifactHashes
    },
    options.id ?? "evt_tool_step_bounded_1",
    options.sequence ?? 3
  );
}

function residentFinalObservationEvent(
  planEvent: Readonly<Record<string, unknown>>,
  toolStepEvent: Readonly<Record<string, unknown>>,
  durableBudget: ReturnType<typeof budget>,
  options: {
    readonly id?: string;
    readonly sequence?: number;
    readonly observationId?: string;
    readonly toolRequestId?: string;
  } = {}
): Readonly<Record<string, unknown>> {
  const plan = Reflect.get(planEvent, "payload") as Readonly<Record<string, unknown>>;
  const toolStep =
    Reflect.get(toolStepEvent, "payload") as Readonly<Record<string, unknown>>;
  return residentEvent(
    "agent.resident-observation.recorded.v2",
    {
      schemaVersion: "resident-observation-record.v2",
      residentAgentId: plan.residentAgentId,
      workspaceId: plan.workspaceId,
      taskId: plan.taskId,
      attemptId: plan.attemptId,
      runId: plan.runId,
      runMode: plan.runMode,
      workflowDescriptor: plan.workflowDescriptor,
      policy: plan.policy,
      authority: plan.authority,
      sourceEventIds: plan.sourceEventIds,
      contextPackRefs: plan.contextPackRefs,
      budget: durableBudget,
      causationId: toolStepEvent.id,
      correlationId: plan.correlationId,
      observationId: options.observationId ?? "observation_bounded_final",
      planId: plan.planId,
      planRevision: plan.planRevision,
      planReadback: planReadbackFor(planEvent),
      stepOrdinal: 1,
      kind: "tool-result",
      safeSummary: "The durable gateway state was observed.",
      artifactHashes: toolStep.resultArtifactHashes,
      toolRequestId: options.toolRequestId ?? "toolreq_bounded_harness"
    },
    options.id ?? "evt_observation_bounded_final",
    options.sequence ?? 4
  );
}

function residentResult(
  category: "handoff-recorded" | "approval-required" | "effect-outcome-unknown",
  durableBudget: ReturnType<typeof budget>,
  terminal: boolean,
  planEvent: Readonly<Record<string, unknown>>,
  observationEvent: Readonly<Record<string, unknown>>,
  authorityBinding: Readonly<Record<string, unknown>>,
  sequence = terminal ? 5 : 6,
  resultHash: `sha256:${string}` = hash("7")
): Readonly<Record<string, unknown>> {
  const plan = Reflect.get(planEvent, "payload") as Readonly<Record<string, unknown>>;
  const payload = {
    schemaVersion: "resident-loop-result.v2",
    residentAgentId: plan.residentAgentId,
    workspaceId: plan.workspaceId,
    taskId: plan.taskId,
    attemptId: plan.attemptId,
    runId: plan.runId,
    runMode: plan.runMode,
    workflowDescriptor: plan.workflowDescriptor,
    policy: plan.policy,
    authority: plan.authority,
    sourceEventIds: plan.sourceEventIds,
    contextPackRefs: plan.contextPackRefs,
    budget: durableBudget,
    causationId: terminal ? observationEvent.id : "evt_suspension",
    correlationId: plan.correlationId,
    planId: plan.planId,
    planRevision: plan.planRevision,
    planReadback: planReadbackFor(planEvent),
    finalObservationReadback: observationReadbackFor(observationEvent),
    outcome: terminal ? "completed" : "resumable",
    category,
    resultHash,
    ...(terminal ? {
      handoffReadback: specialistHandoffReadback(
        "handoff_bounded",
        plan.taskId,
        plan.runId,
        authorityBinding
      )
    } : {
      resumeAnchor: {
        checkpointEventId: "evt_suspension",
        resumptionDeadlineAt: "2026-07-28T13:00:00.000Z",
        nextSafeAction: category === "approval-required"
          ? "await-human-review"
          : "reconcile-effect-outcome"
      }
    })
  };
  return residentEvent(
    "agent.resident-loop.result.recorded.v2",
    payload,
    `evt_result_${category.replaceAll("-", "_")}`,
    sequence
  );
}

function mutateCompletedReplayEvents(
  events: readonly Readonly<Record<string, unknown>>[],
  mutation: HarnessMutation
): Readonly<Record<string, unknown>>[] {
  const copied = structuredClone(events) as Record<string, unknown>[];
  const event = (index: number): Record<string, unknown> => copied[index]!;
  const payload = (index: number): Record<string, unknown> =>
    event(index).payload as Record<string, unknown>;
  const context = (index: number): Record<string, unknown> =>
    event(index).context as Record<string, unknown>;

  switch (mutation) {
    case "event-version":
      event(0).version = 999;
      break;
    case "event-stream":
      event(1).streamId = "agent_resident_loop_abstract_other";
      break;
    case "event-sequence-gap":
      for (let index = 1; index < copied.length; index += 1) {
        event(index).sequence = (index + 1) * 10;
      }
      break;
    case "event-context":
      context(2).occurredAt = "2026-07-28T12:00:01.000Z";
      break;
    case "payload-binding":
      payload(1).correlationId = "corr_bounded_other";
      context(1).correlationId = "corr_bounded_other";
      break;
    case "plan-readback": {
      const readback = payload(1).planReadback as Record<string, unknown>;
      readback.planRecordEventId = "evt_plan_abstract_other";
      break;
    }
    case "tool-binding-state":
      payload(2).state = "suspended";
      break;
    case "observation-causation":
      payload(1).causationId = "evt_abstract_other";
      context(1).causationId = "evt_abstract_other";
      break;
    case "final-observation-causation":
      payload(3).causationId = "evt_abstract_other";
      context(3).causationId = "evt_abstract_other";
      break;
    case "terminal-final-readback": {
      const readback =
        payload(4).finalObservationReadback as Record<string, unknown>;
      readback.observationEventId = "evt_observation_abstract_other";
      break;
    }
    case "required-action-budget-zero": {
      const zeroConsumed = Object.fromEntries(
        tenBudgetFields.map((field) => [field, 0])
      );
      const fullRemaining = Object.fromEntries(
        tenBudgetFields.map((field) => [field, hardMaximums[field]])
      );
      const ceilings = { ...hardMaximums };
      for (const replayEvent of copied) {
        const replayPayload = replayEvent.payload as Record<string, unknown>;
        replayPayload.budget = {
          ceilings: { ...ceilings },
          consumed: { ...zeroConsumed },
          remaining: { ...fullRemaining },
          actionConsumption: { ...zeroConsumed }
        };
      }
      break;
    }
    default:
      return events as Readonly<Record<string, unknown>>[];
  }
  return deepFreeze(copied);
}

function residentSuspension(
  category: "approval-required" | "effect-outcome-unknown",
  durableBudget: ReturnType<typeof budget>,
  mutation: HarnessMutation,
  planEvent: Readonly<Record<string, unknown>>,
  observationEvent: Readonly<Record<string, unknown>>,
  branch: HarnessBranch,
  material: CanonicalToolStepMaterial
): Readonly<Record<string, unknown>> {
  const plan = Reflect.get(planEvent, "payload") as Readonly<Record<string, unknown>>;
  const steps = plan.steps as readonly Readonly<Record<string, unknown>>[];
  const step = steps[0]!;
  const resumptionDeadlineAt = mutation === "deadline-mismatch"
    ? "2026-07-29T12:00:00.000Z"
    : "2026-07-28T13:00:00.000Z";
  const nextSafeAction = mutation === "next-safe-action-mismatch"
    ? "restart-from-scratch"
    : category === "approval-required"
      ? "await-human-review"
      : "reconcile-effect-outcome";
  const orchestrationCheckpointEventId = "evt_orchestration_checkpoint";
  const logicalLocator = {
    workspaceId: plan.workspaceId,
    residentAgentId: plan.residentAgentId,
    taskId: plan.taskId,
    attemptId: plan.attemptId,
    runId: plan.runId,
    planId: plan.planId,
    planRevision: plan.planRevision,
    stepOrdinal: step.ordinal,
    toolRequestId: mutation === "burned-tool-request-reuse"
      ? "toolreq_bounded_reused"
      : "toolreq_bounded_harness",
    toolId: step.toolId,
    toolVersion: step.toolVersion,
    executionCapabilityHash: hash("9")
  };
  const humanUnknown = branch === "effect-outcome-unknown-human";
  const checkpoint = category === "approval-required"
    ? {
        authorizationKind: "awaiting-human-approval",
        orchestrationCheckpointEventId,
        requestEventId: "evt_gateway_request",
        resumptionDeadlineAt,
        nextSafeAction
      }
    : {
        authorizationKind: humanUnknown
          ? "effect-outcome-unknown-human"
          : "effect-outcome-unknown-automatic",
        orchestrationCheckpointEventId,
        logicalLocator,
        requestEventId: "evt_gateway_request",
        ...(humanUnknown ? {
          decisionEventId: "evt_gateway_decision",
          approvedBy: "human_bounded_reviewer",
          approvedPreviewHash: material.previewHash
        } : {}),
        executionClaimEventId: "evt_gateway_claim",
        executionCapabilityHash: hash("9"),
        resumptionDeadlineAt,
        nextSafeAction,
        ...(mutation === "receipt-on-unknown-claim"
          ? { outcomeReceiptEventId: "evt_gateway_receipt" }
          : {}),
        ...(mutation === "terminal-on-unknown-claim"
          ? { resultEventId: "evt_gateway_result" }
          : {})
      };
  return residentEvent(
    "agent.resident-loop.suspended.v2",
    {
      schemaVersion: "resident-loop-suspension.v2",
      residentAgentId: plan.residentAgentId,
      workspaceId: plan.workspaceId,
      taskId: plan.taskId,
      attemptId: plan.attemptId,
      runId: mutation === "cross-run-anchor" ? "run_bounded_other" : plan.runId,
      runMode: plan.runMode,
      workflowDescriptor: plan.workflowDescriptor,
      policy: plan.policy,
      authority: plan.authority,
      sourceEventIds: plan.sourceEventIds,
      contextPackRefs: plan.contextPackRefs,
      budget: durableBudget,
      causationId: orchestrationCheckpointEventId,
      correlationId: plan.correlationId,
      planId: plan.planId,
      planRevision: plan.planRevision,
      planReadback: planReadbackFor(planEvent),
      finalObservationReadback: observationReadbackFor(observationEvent),
      suspensionCategory: mutation === "category-mismatch" ? "context-stale" : category,
      checkpoint
    },
    "evt_suspension",
    5
  );
}

function residentEvent(
  type: string,
  payload: unknown,
  id = `evt_${type.replaceAll(".", "_")}`,
  sequence = 1
): Readonly<Record<string, unknown>> {
  const causationId = payload !== null && typeof payload === "object"
    ? Reflect.get(payload, "causationId")
    : undefined;
  return deepFreeze({
    id,
    type,
    version: 1,
    streamId: `agent_resident_loop_task_bounded_harness_${harnessAttemptId}_run_bounded_harness`,
    sequence,
    context: {
      actor: { id: "agent_default", kind: "agent", label: "Resident agent" },
      occurredAt: "2026-07-28T12:00:00.000Z",
      ...(typeof causationId === "string" ? { causationId } : {}),
      correlationId: "corr_bounded_harness",
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", agent: "0.1.0" }
    },
    payload
  });
}

function budget(
  selectedField: BudgetField = "activeExecutionMs",
  overBudget = false,
  consumedBefore: Partial<Record<BudgetField, number>> = {}
) {
  const ceilings = Object.fromEntries(
    tenBudgetFields.map((field) => [field, hardMaximums[field]])
  ) as Record<BudgetField, number>;
  const consumed = Object.fromEntries(
    tenBudgetFields.map((field) => [
      field,
      (consumedBefore[field] ?? 0) + (field === selectedField ? 1 : 0)
    ])
  ) as Record<BudgetField, number>;
  const remaining = Object.fromEntries(
    tenBudgetFields.map((field) => [
      field,
      ceilings[field] - consumed[field]
    ])
  ) as Record<BudgetField, number>;
  if (overBudget) {
    consumed[selectedField] = hardMaximums[selectedField] + 1;
    remaining[selectedField] = 0;
  }
  return {
    ceilings,
    consumed,
    remaining,
    actionConsumption: Object.fromEntries(
      tenBudgetFields.map((field) => [field, field === selectedField ? 1 : 0])
    ) as Record<BudgetField, number>
  };
}

function budgetWithAdditionalConsumption(
  requiredField: BudgetField,
  selectedField: BudgetField | undefined,
  overBudget: boolean,
  consumedBefore: Partial<Record<BudgetField, number>>
) {
  const ceilings = Object.fromEntries(
    tenBudgetFields.map((field) => [field, hardMaximums[field]])
  ) as Record<BudgetField, number>;
  const actionConsumption = Object.fromEntries(
    tenBudgetFields.map((field) => [field, field === requiredField ? 1 : 0])
  ) as Record<BudgetField, number>;
  if (selectedField !== undefined && selectedField !== requiredField) {
    actionConsumption[selectedField] = 1;
  }
  if (overBudget && selectedField !== undefined) {
    actionConsumption[selectedField] =
      hardMaximums[selectedField] - (consumedBefore[selectedField] ?? 0) + 1;
  }
  const consumed = Object.fromEntries(
    tenBudgetFields.map((field) => [
      field,
      (consumedBefore[field] ?? 0) + actionConsumption[field]
    ])
  ) as Record<BudgetField, number>;
  const remaining = Object.fromEntries(
    tenBudgetFields.map((field) => [
      field,
      Math.max(0, ceilings[field] - consumed[field])
    ])
  ) as Record<BudgetField, number>;
  return {
    ceilings,
    consumed,
    remaining,
    actionConsumption
  };
}

function zeroEffects(): BoundaryEffects {
  return {
    provider: 0,
    gatewayInvocation: 0,
    approvalConsumption: 0,
    ledgerAppend: 0,
    projectionSubstitute: 0,
    fallback: 0,
    localWrite: 0,
    route: 0,
    defaultRuntime: 0
  };
}

function expectTraceSubsequence(
  trace: readonly string[],
  expected: readonly string[]
): void {
  let cursor = 0;
  for (const entry of trace) {
    if (entry === expected[cursor]) cursor += 1;
  }
  expect(
    cursor,
    `missing ordered trace suffix: ${expected.slice(cursor).join(" -> ")}`
  ).toBe(expected.length);
}

function sameIdentity(value: unknown, binding: Readonly<Record<string, unknown>>): boolean {
  if (value === null || typeof value !== "object") return false;
  return ["residentAgentId", "workspaceId", "taskId", "attemptId", "runId"].every(
    (key) => Reflect.get(value, key) === binding[key]
  );
}

function sameHandoffInput(
  value: unknown,
  binding: Readonly<Record<string, unknown>>,
  authorityBinding: Readonly<Record<string, unknown>>
): boolean {
  return hasExactFrozenDataSurface(value, ["authorityBinding", "runId", "taskId"]) &&
    Reflect.get(value, "taskId") === binding.taskId &&
    Reflect.get(value, "runId") === binding.runId &&
    sameCanonical(Reflect.get(value, "authorityBinding"), authorityBinding);
}

function sameResumeLocator(
  value: unknown,
  binding: Readonly<Record<string, unknown>>
): boolean {
  return hasExactFrozenDataSurface(value, [
    "attemptId",
    "checkpointSemanticKey",
    "runId",
    "taskId"
  ]) &&
    Reflect.get(value, "taskId") === binding.taskId &&
    Reflect.get(value, "attemptId") === binding.attemptId &&
    Reflect.get(value, "runId") === binding.runId &&
    Reflect.get(value, "checkpointSemanticKey") === "resident-suspension-task_bounded_harness";
}

function expectExactFrozenDataSurface(
  value: unknown,
  expectedKeys: readonly string[],
  label: string
): void {
  expect(hasExactFrozenDataSurface(value, expectedKeys), label).toBe(true);
}

function suspensionKeysFromCheckpointCandidate(
  value: unknown
): SuspensionSemanticKeys | undefined {
  if (!isExactFrozenOwnDataTree(value) || value === null || typeof value !== "object") {
    return undefined;
  }
  const instruction = Reflect.get(value, "residentLoopSuspension");
  if (
    instruction === null ||
    typeof instruction !== "object"
  ) {
    return undefined;
  }
  const suspensionSemanticKey = Reflect.get(
    instruction,
    "suspensionSemanticKey"
  );
  const resultSemanticKey = Reflect.get(instruction, "resultSemanticKey");
  if (
    !isContentHash(suspensionSemanticKey) ||
    !isContentHash(resultSemanticKey) ||
    suspensionSemanticKey === resultSemanticKey
  ) {
    return undefined;
  }
  return Object.freeze({ suspensionSemanticKey, resultSemanticKey });
}

function isExactFrozenOwnDataTree(value: unknown): boolean {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (
    typeof value !== "object" ||
    types.isProxy(value) ||
    !Object.isFrozen(value) ||
    Object.getOwnPropertySymbols(value).length !== 0
  ) {
    return false;
  }
  const array = Array.isArray(value);
  if (
    Object.getPrototypeOf(value) !==
      (array ? Array.prototype : Object.prototype)
  ) {
    return false;
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (array) {
    const length = descriptors.length;
    if (
      length === undefined ||
      !("value" in length) ||
      !Number.isSafeInteger(length.value) ||
      Object.keys(descriptors).length !== length.value + 1
    ) {
      return false;
    }
    for (let index = 0; index < length.value; index += 1) {
      const descriptor = descriptors[String(index)];
      if (
        descriptor === undefined ||
        !descriptor.enumerable ||
        !("value" in descriptor) ||
        !isExactFrozenOwnDataTree(descriptor.value)
      ) {
        return false;
      }
    }
    return true;
  }
  for (const descriptor of Object.values(descriptors)) {
    if (
      !descriptor.enumerable ||
      !("value" in descriptor) ||
      !isExactFrozenOwnDataTree(descriptor.value)
    ) {
      return false;
    }
  }
  return true;
}

function isContentHash(value: unknown): value is `sha256:${string}` {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
}

function semanticKeyFor(
  family: string,
  value: unknown
): `sha256:${string}` {
  return `sha256:${createHash("sha256")
    .update(`${family}\n${JSON.stringify(value)}`)
    .digest("hex")}`;
}

function hasExactFrozenDataSurface(
  value: unknown,
  expectedKeys: readonly string[]
): value is Readonly<Record<string, unknown>> {
  if (
    value === null ||
    typeof value !== "object" ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    !Object.isFrozen(value)
  ) {
    return false;
  }
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key === "symbol")) return false;
  const stringKeys = ownKeys as string[];
  if (
    stringKeys.length !== expectedKeys.length ||
    [...stringKeys].sort().some((key, index) => key !== [...expectedKeys].sort()[index])
  ) {
    return false;
  }
  return stringKeys.every((key) => {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined &&
      "value" in descriptor &&
      descriptor.enumerable &&
      descriptor.configurable === false &&
      descriptor.writable === false;
  });
}

function sameCanonical(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function assertValidResidentReplayFixture(
  events: readonly Readonly<Record<string, unknown>>[]
): void {
  const parsed: KnowledgeEvent[] = [];
  for (const event of events) {
    const validation = validateKnowledgeEvent(event);
    if (!validation.success) {
      throw new Error(`invalid resident fixture: ${JSON.stringify(validation.error.issues)}`);
    }
    parsed.push(validation.data);
  }
  const sequence = validateResidentLoopEventSequence(parsed);
  if (!sequence.success) {
    throw new Error(`invalid resident replay: ${JSON.stringify(sequence.issues)}`);
  }
}

function hash(character: string): `sha256:${string}` {
  return `sha256:${character.repeat(64)}`;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}
