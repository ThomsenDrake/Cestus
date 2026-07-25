import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sourcePath = resolve(process.cwd(), "packages/agent/src/bounded-agent-loop.ts");
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

function boundedSource(): string {
  expect(existsSync(sourcePath), "approved bounded-agent-loop API is absent").toBe(true);
  return readFileSync(sourcePath, "utf8");
}

describe("bounded resident agent loop", () => {
  it("completes only from exact H full readback under all ten replayed budgets", () => {
    const source = boundedSource();
    const completionMutations = [
      "missing-full-readback",
      "cross-task-readback",
      "cross-run-readback",
      "cross-authority-readback",
      "non-completed-handoff-state",
      "selected-readback-mismatch",
      "missing-recorded-event",
      "missing-terminal-event",
      "missing-task-status-event",
      "budget-over-hard-maximum",
      "consumed-plus-remaining-mismatch",
      "replan-budget-reset",
      "concurrent-reread-conflict"
    ] as const;

    expect(source).toContain("createResidentBoundedAgentLoopFromIssuedCapabilities");
    expect(source).toContain("readFull");
    expect(source).toContain('"task-completed"');
    for (const field of tenBudgetFields) expect(source).toContain(field);
    expect(new Set(tenBudgetFields).size).toBe(10);
    expect(completionMutations).toHaveLength(13);
  });

  it("suspends approval and unknown outcomes through W and resumes from durable replay", () => {
    const source = boundedSource();
    const resumableBranches = [
      "approval-required",
      "effect-outcome-unknown-automatic",
      "effect-outcome-unknown-human"
    ] as const;
    const rejectedResumeMutations = [
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
    ] as const;

    expect(source).toContain("suspendAndRelease");
    expect(source).toContain("reclaimAndReverify");
    expect(source).toContain("readReplay");
    expect(source).toContain("rereadAndIssueFromLedger");
    expect(source).toContain('"approval-required"');
    expect(source).toContain('"effect-outcome-unknown"');
    expect(resumableBranches).toHaveLength(3);
    expect(rejectedResumeMutations).toHaveLength(10);
  });

  it("fails closed with zero fallback write or effect on every hostile boundary", () => {
    const source = boundedSource();
    const hostileMutations = [
      "accessor",
      "proxy",
      "symbol",
      "inherited-field",
      "unsafe-prototype",
      "sparse-array",
      "custom-array",
      "post-call-mutation",
      "unknown-key",
      "unsafe-text",
      "workspace",
      "resident",
      "task",
      "attempt",
      "run",
      "descriptor",
      "policy",
      "authority",
      "source",
      "context",
      "correlation",
      "plan",
      "revision",
      "readback",
      "fabricated-capability",
      "swapped-capability",
      "stale-capability"
    ] as const;
    const forbiddenEffects = {
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

    expect(source).toContain("createResidentBoundedAgentLoopFromIssuedCapabilities");
    expect(source).not.toMatch(/fallback(?:Store|Write)|localWrite|artifactScan|rawProvider|rawTool|graphMutation/);
    expect(source).not.toMatch(/local-runtime|agent-http-routes|defaultLocalAgentRuntimeFactory|operator-status/);
    expect(hostileMutations).toHaveLength(27);
    expect(forbiddenEffects).toEqual({
      provider: 0,
      gatewayInvocation: 0,
      approvalConsumption: 0,
      ledgerAppend: 0,
      projectionSubstitute: 0,
      fallback: 0,
      localWrite: 0,
      route: 0,
      defaultRuntime: 0
    });
  });
});
