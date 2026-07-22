import { describe, expect, it } from "vitest";
import {
  buildSpecialistHandoffMaterial,
  hashSpecialistHandoffMaterial
} from "../../agent/src/specialist-handoff-manifest.js";
import {
  hashUntrustedSpecialistHandoffPreparation,
  type UntrustedSpecialistHandoffPreparationV1
} from "../../agent/src/specialist-handoff-preparation.js";
import { createUntrustedSpecialistRunner } from "../src/agent-runtime-specialist-runners.js";

describe("specialist runner preparation dispatch", () => {
  it("returns a delegate result only as the exact nonterminal preparation field", async () => {
    const input = Object.freeze({
      taskId: "task_preparation",
      runType: "evidence-triage" as const,
      attemptId: "attempt_preparation",
      approvedRunId: "run_preparation"
    });
    const preparation = preparationFor(input);
    const runner = createUntrustedSpecialistRunner({
      async delegate() {
        return preparation;
      }
    });

    const result = await runner.dispatch(input);

    expect(result).toEqual(Object.freeze({
      preparation: Object.freeze({
        schemaVersion: "agent.task-orchestrator.runner-preparation.v1",
        preparation
      })
    }));
    expect(Object.keys(result)).toEqual(["preparation"]);
    expect("durableHandoff" in result).toBe(false);
    expect("terminal" in result).toBe(false);
  });

  it("rejects a delegate durable or terminal lookalike without invoking H or a provider", async () => {
    const input = Object.freeze({
      taskId: "task_lookalike",
      runType: "evidence-triage" as const,
      attemptId: "attempt_lookalike",
      approvedRunId: "run_lookalike"
    });
    const preparation = preparationFor(input);
    let handoffCalls = 0;
    let providerCalls = 0;
    const runner = createUntrustedSpecialistRunner({
      async delegate() {
        return {
          ...preparation,
          durableHandoff: Object.freeze({
            runId: input.approvedRunId,
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
          }),
          terminal: Object.freeze({ eventId: "evt_forged_terminal" })
        };
      }
    });

    await expect(runner.dispatch(input)).rejects.toMatchObject({ code: "runner-preparation-invalid" });
    expect(handoffCalls).toBe(0);
    expect(providerCalls).toBe(0);
  });
});

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
      contentHash: hash("b"),
      sizeBytes: 1,
      generatedAt: "2026-07-15T00:00:00.000Z",
      safeSummary: "Workspace overview.",
      provenanceRefs: Object.freeze(["evt_source_preparation"])
    })],
    outputArtifacts: [],
    toolRequestIds: [],
    approvalRequirements: [],
    nextSafeActions: [],
    sourceEventIds: ["evt_source_preparation"],
    relatedEventIds: ["evt_related_preparation"]
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
