import { describe, expect, it } from "vitest";
import {
  agentSchedulerWakeResultDtoSchema,
  hashAgentToolPreview,
  type AgentApprovedToolExecutorDescriptor,
  type AgentSchedulerWakeResultDto
} from "../src/index.js";

const safeHash = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

describe("agent scheduler contracts", () => {
  it("exports a stable wake result DTO with boring counts and safe item summaries", () => {
    const dto: AgentSchedulerWakeResultDto = {
      schemaVersion: "agent-scheduler-wake-result.v1",
      generatedAt: "2026-07-09T12:00:00.000Z",
      examinedCount: 1,
      resumedCount: 1,
      completedCount: 1,
      blockedCount: 0,
      failedCount: 0,
      eventIds: ["evt_agent_tool_completed"],
      allowedNextActions: ["refresh agent status"],
      items: [
        {
          toolRequestId: "toolreq_scheduler_contract",
          runId: "run_scheduler_contract",
          toolId: "agent.test.effect",
          toolVersion: "1.0.0",
          state: "completed",
          approvalClass: "ledger-review",
          previewHash: safeHash,
          currentPreviewHash: safeHash,
          eventIds: ["evt_agent_tool_completed"],
          allowedNextActions: ["refresh agent status"]
        }
      ]
    };

    expect(agentSchedulerWakeResultDtoSchema.parse(dto)).toEqual(dto);
  });

  it("keeps descriptor execution behind buildCurrentPreview and executeApproved", async () => {
    const descriptor: AgentApprovedToolExecutorDescriptor = {
      toolId: "agent.test.effect",
      toolVersion: "1.0.0",
      sideEffectClass: "ledger-review",
      approvalClass: "ledger-review",
      async buildCurrentPreview(input) {
        return {
          preview: {
            summary: `Review ledger proposal for ${input.toolRequestId}.`,
            relatedEventIds: ["evt_source_review"]
          },
          sourceEventIds: ["evt_source_review"],
          inputArtifactHashes: [],
          provenanceRefs: ["evt_source_review"],
          activeLocks: [],
          freshnessChecks: [
            {
              name: "agent-projection",
              expected: "high-watermark:1",
              actual: "high-watermark:1",
              ok: true
            }
          ]
        };
      },
      async executeApproved() {
        return {
          eventIds: ["evt_fake_domain_result"],
          artifactHashes: ["sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"],
          readModelChanges: [
            {
              projectionName: "agent-test",
              change: "fake executor completed"
            }
          ],
          resultSummary: "Fake executor completed."
        };
      }
    };

    const current = await descriptor.buildCurrentPreview({
      toolRequestId: "toolreq_scheduler_contract",
      runId: "run_scheduler_contract",
      toolId: "agent.test.effect",
      toolVersion: "1.0.0",
      requestedPreviewHash: safeHash
    });

    expect(current.provenanceRefs).toEqual(["evt_source_review"]);
    expect(current.freshnessChecks.every((check) => check.ok)).toBe(true);
    await expect(
      descriptor.executeApproved({
        toolRequestId: "toolreq_scheduler_contract",
        runId: "run_scheduler_contract",
        toolId: "agent.test.effect",
        toolVersion: "1.0.0",
        sideEffectClass: "ledger-review",
        approvalClass: "ledger-review",
        previewHash: safeHash,
        approvedPreviewHash: safeHash,
        approvedBy: "actor_case_owner",
        sourceEventIds: ["evt_source_review"],
        inputArtifactHashes: [],
        provenanceRefs: ["evt_source_review"]
      })
    ).resolves.toMatchObject({ resultSummary: "Fake executor completed." });
  });

  it("uses the same stable preview hash boundary as the tool gateway", () => {
    const left = hashAgentToolPreview({
      summary: "Stable preview.",
      zeta: "last",
      alpha: "first"
    });
    const right = hashAgentToolPreview({
      alpha: "first",
      zeta: "last",
      summary: "Stable preview."
    });

    expect(left).toBe(right);
    expect(left).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});
