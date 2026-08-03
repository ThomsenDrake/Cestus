import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildResolvedContextPack } from "../../agent/src/context-packs.js";
import {
  buildSpecialistHandoffMaterial,
  hashSpecialistHandoffMaterial
} from "../../agent/src/specialist-handoff-manifest.js";
import {
  hashUntrustedSpecialistHandoffPreparation,
  type UntrustedSpecialistHandoffPreparationV1
} from "../../agent/src/specialist-handoff-preparation.js";
import {
  createSourcedInvestigationSpecialistRunner,
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

  it("composes deterministic local timeline execution into a canonical nonterminal preparation", async () => {
    const store = sourcedStore();
    let invocations = 0;
    const runner = createSourcedInvestigationSpecialistRunner({
      resolve: () => ({
        contextPacks: sourcedContextPacks(),
        ...sourcedPromptArtifact(),
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
    expect(store.putCount()).toBe(4);
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
      resolve: () => ({
        contextPacks: sourcedContextPacks(),
        ...sourcedPromptArtifact(),
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

function sourcedContextPacks() {
  const shared = {
    version: 1,
    generatedAt: "2026-08-03T12:00:00.000Z",
    safeSummary: "Local sourced runner context.",
    provenanceRefs: ["evt_timeline_source_001"],
    sourceEventIds: ["evt_timeline_source_001", "evt_assertion_proposed_001", "evt_assertion_accepted_001"]
  } as const;
  return [
    buildResolvedContextPack({
      ...shared,
      contextPackId: "evidence-summary.v1",
      payload: { items: [{
        evidenceId: "ev_timeline_source_001",
        ingestionEventId: "evt_timeline_source_001",
        contentHash: hash("a")
      }] }
    }),
    buildResolvedContextPack({
      ...shared,
      contextPackId: "accepted-graph-projection.v1",
      payload: { items: { assertions: [{
        assertionId: "assertion_timeline_source_001",
        evidenceId: "ev_timeline_source_001",
        evidenceContentHash: hash("a"),
        proposedByEventId: "evt_assertion_proposed_001",
        acceptedByEventId: "evt_assertion_accepted_001",
        sourceEventIds: ["evt_assertion_proposed_001", "evt_assertion_accepted_001"],
        rowHash: hash("b")
      }], entities: [], relationships: [] } }
    })
  ];
}

function sourcedTimelineOutput() {
  return {
    timelineItems: [{
      itemId: "timeline_runtime_001",
      date: "2026-03-01",
      precision: "day" as const,
      evidenceRefs: ["ev_timeline_source_001"],
      assertionRefs: [],
      prrEventRefs: [],
      contentHashRefs: [hash("a")],
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

function sourcedPromptArtifact() {
  const promptArtifactBytes = Buffer.from("canonical local sourced runner prompt", "utf8");
  return Object.freeze({
    promptArtifactBytes,
    promptArtifactHash: `sha256:${createHash("sha256").update(promptArtifactBytes).digest("hex")}` as `sha256:${string}`
  });
}
