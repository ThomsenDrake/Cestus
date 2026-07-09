import { describe, expect, it } from "vitest";
import {
  agentSchedulerItemSummaryDtoSchema,
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

  it.each(["none", "human-review", "ledger-review"] as const)(
    "accepts scheduler approval class %s in wake DTO transport summaries",
    (approvalClass) => {
      const dto = buildWakeResultDto({
        item: { approvalClass }
      });

      expect(agentSchedulerWakeResultDtoSchema.parse(dto).items[0]?.approvalClass).toBe(approvalClass);
    }
  );

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

  it("rejects numeric toolVersion values in public scheduler dto parsing", () => {
    const dto = buildWakeResultDto({
      item: { toolVersion: 1 }
    });
    const parsed = agentSchedulerWakeResultDtoSchema.safeParse(dto);

    expect(parsed.success).toBe(false);
  });

  it("rejects unknown authorization fields on public scheduler wake result DTOs", () => {
    const dto = {
      ...buildWakeResultDto(),
      authorization: "Bearer sk-live-review-token"
    };
    const parsed = agentSchedulerWakeResultDtoSchema.safeParse(dto);

    expect(parsed.success).toBe(false);
  });

  it("rejects unknown credential fields on public scheduler item summary DTOs", () => {
    const item = {
      ...buildItemSummaryDto(),
      credential: "sk-live-review-token"
    };

    expect(agentSchedulerItemSummaryDtoSchema.safeParse(item).success).toBe(false);
    expect(
      agentSchedulerWakeResultDtoSchema.safeParse({
        ...buildWakeResultDto(),
        items: [item]
      }).success
    ).toBe(false);
  });

  it.each([
    {
      label: "unsafe tool request id",
      patch: { item: { toolRequestId: "toolreq_sk-live-review-token" } }
    },
    {
      label: "unsafe run id",
      patch: { item: { runId: "API_KEY=run_scheduler_contract" } }
    },
    {
      label: "unsafe tool id",
      patch: { item: { toolId: "provider.bytes.transfer.sk-live-token" } }
    },
    {
      label: "unsafe tool version",
      patch: { item: { toolVersion: "ghp_secret_version" } }
    },
    {
      label: "malformed approval class",
      patch: { item: { approvalClass: "human review" } }
    },
    {
      label: "secret-shaped approval class",
      patch: { item: { approvalClass: "sk-live-review-token" } }
    },
    {
      label: "unsafe category",
      patch: { item: { category: "password: leaked" } }
    },
    {
      label: "unsafe message",
      patch: { item: { message: "authorization bearer sk-live-token" } }
    },
    {
      label: "unsafe allowed next action",
      patch: { allowedNextActions: ["copy API_KEY=sk-live-token to clipboard"] }
    },
    {
      label: "unsafe item-level allowed next action",
      patch: { item: { allowedNextActions: ["export PRIVATE_KEY to logs"] } }
    }
  ])("rejects %s in public scheduler dto parsing", ({ patch }) => {
    const dto = buildWakeResultDto(patch);
    const parsed = agentSchedulerWakeResultDtoSchema.safeParse(dto);

    expect(parsed.success).toBe(false);
  });
});

type SchedulerWakeResultItemPatch =
  Partial<Omit<AgentSchedulerWakeResultDto["items"][number], "approvalClass" | "toolVersion">> & {
    approvalClass?: string;
    toolVersion?: unknown;
  };

type SchedulerWakeResultItemInput =
  Omit<AgentSchedulerWakeResultDto["items"][number], "approvalClass" | "toolVersion"> & {
    approvalClass: string;
    toolVersion: unknown;
  };

type SchedulerWakeResultDtoInput = Omit<AgentSchedulerWakeResultDto, "items"> & {
  items: SchedulerWakeResultItemInput[];
};

function buildWakeResultDto(
  patch: {
    item?: SchedulerWakeResultItemPatch;
    allowedNextActions?: AgentSchedulerWakeResultDto["allowedNextActions"];
  } = {}
): SchedulerWakeResultDtoInput {
  return {
    schemaVersion: "agent-scheduler-wake-result.v1",
    generatedAt: "2026-07-09T12:00:00.000Z",
    examinedCount: 1,
    resumedCount: 1,
    completedCount: 1,
    blockedCount: 0,
    failedCount: 0,
    eventIds: ["evt_agent_tool_completed"],
    allowedNextActions: patch.allowedNextActions ?? ["refresh agent status"],
    items: [buildItemSummaryDto(patch.item)]
  };
}

function buildItemSummaryDto(patch: SchedulerWakeResultItemPatch = {}): SchedulerWakeResultItemInput {
  return {
    toolRequestId: "toolreq_scheduler_contract",
    runId: "run_scheduler_contract",
    toolId: "agent.test.effect",
    toolVersion: "1.0.0",
    state: "completed",
    approvalClass: "ledger-review",
    previewHash: safeHash,
    currentPreviewHash: safeHash,
    eventIds: ["evt_agent_tool_completed"],
    allowedNextActions: ["refresh agent status"],
    ...patch
  };
}
