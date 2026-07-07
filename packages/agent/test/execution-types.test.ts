import { describe, expect, it } from "vitest";
import {
  agentExecutionBlockedCategorySchema,
  agentExecutionStateSchema,
  assertAgentExecutionTransition,
  canAgentExecutionTransition
} from "../src/execution-types.js";

describe("resident agent execution state contracts", () => {
  it("accepts the conservative execution state vocabulary", () => {
    expect(agentExecutionStateSchema.options).toEqual([
      "created",
      "queued",
      "running",
      "waiting-for-approval",
      "approved-resumable",
      "blocked",
      "completed",
      "failed",
      "canceled"
    ]);
  });

  it("accepts first-class blocked and failure categories", () => {
    expect(agentExecutionBlockedCategorySchema.options).toContain("approval-stale");
    expect(agentExecutionBlockedCategorySchema.options).toContain("lock-active");
    expect(agentExecutionBlockedCategorySchema.options).toContain("missing-provenance");
    expect(agentExecutionBlockedCategorySchema.options).toContain("secret-detected");
    expect(agentExecutionBlockedCategorySchema.options).toContain("provider-unavailable");
    expect(agentExecutionBlockedCategorySchema.options).toContain("data-loss-risk");
  });

  it("permits the approved resume path and rejects unsafe shortcuts", () => {
    expect(canAgentExecutionTransition("created", "queued")).toBe(true);
    expect(canAgentExecutionTransition("queued", "running")).toBe(true);
    expect(canAgentExecutionTransition("running", "waiting-for-approval")).toBe(true);
    expect(canAgentExecutionTransition("waiting-for-approval", "approved-resumable")).toBe(true);
    expect(canAgentExecutionTransition("approved-resumable", "running")).toBe(true);
    expect(canAgentExecutionTransition("running", "completed")).toBe(true);

    expect(canAgentExecutionTransition("waiting-for-approval", "completed")).toBe(false);
    expect(canAgentExecutionTransition("approved-resumable", "completed")).toBe(false);
    expect(() => assertAgentExecutionTransition("waiting-for-approval", "completed")).toThrow(
      /Invalid agent execution transition/
    );
  });
});
