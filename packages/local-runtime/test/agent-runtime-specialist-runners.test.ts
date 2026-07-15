import { describe, expect, it } from "vitest";
import {
  buildSpecialistHandoffMaterial,
  hashSpecialistHandoffMaterial
} from "../../agent/src/specialist-handoff-manifest.js";
import {
  hashUntrustedSpecialistHandoffPreparation,
  type UntrustedSpecialistHandoffPreparationV1
} from "../../agent/src/specialist-handoff-preparation.js";
import {
  createUntrustedSpecialistRunner,
  type UntrustedSpecialistRunner
} from "../src/agent-runtime-specialist-runners.js";

const dispatch = Object.freeze({
  taskId: "task_runtime",
  runType: "evidence-triage" as const,
  attemptId: "attempt_runtime",
  approvedRunId: "run_runtime"
});

describe("untrusted specialist runner", () => {
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
