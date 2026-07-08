import { describe, expect, it } from "vitest";
import {
  agentApprovalCockpitDtoSchema,
  agentApprovalDecisionResultDtoSchema,
  buildAgentApprovalCockpit
} from "../src/approval-cockpit.js";
import type { AgentStatusDto } from "../src/runtime-types.js";

const previewHash = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const artifactHash = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

describe("agent approval cockpit dto", () => {
  it("projects provider byte-transfer requests into decision-only approval queues", () => {
    const cockpit = buildAgentApprovalCockpit({
      status: agentStatus({
        toolRequests: [providerTransferRequest()]
      }),
      generatedAt: "2026-07-08T14:00:00.000Z"
    });

    expect(agentApprovalCockpitDtoSchema.parse(cockpit)).toEqual(cockpit);
    expect(cockpit.schemaVersion).toBe("agent-approval-cockpit.v1");
    expect(cockpit.summary.pendingCount).toBe(1);
    expect(cockpit.decisionContract).toMatchObject({
      approvalAppendsDecisionOnly: true,
      denialAppendsDecisionOnly: true
    });
    expect(cockpit.decisionContract.afterApproval).toMatch(/revalidat.*preview hash/i);
    expect(cockpit.approvalClasses).toContainEqual(expect.objectContaining({
      approvalClass: "provider-byte-transfer",
      providerByteTransferNote: expect.stringMatching(/byte transfer/i)
    }));
    expect(cockpit.queue.pending[0]).toMatchObject({
      toolRequestId: "toolreq_provider_transfer",
      approvalClass: "provider-byte-transfer",
      requiredApprovalClass: "provider-byte-transfer",
      previewHash,
      executableByApproval: false,
      providerByteTransferNote: expect.stringMatching(/does not transfer bytes/i),
      staleness: {
        state: "current",
        approvable: true
      },
      approvalContract: {
        requiredApprovalClass: "provider-byte-transfer",
        approvalRouteAppendsOnly: true,
        denialRouteAppendsOnly: true,
        rationaleRequired: true,
        rationaleSecretSafe: true
      }
    });
    expect(cockpit.queue.pending[0]?.review).toMatchObject({
      what: "Selected evidence excerpts for provider processing.",
      dataLeavesOrChanges: "Send selected evidence excerpts to the configured provider after approval.",
      whatHappensAfterApproval: expect.stringMatching(/separate scheduler/i)
    });
    expect(cockpit.queue.pending[0]?.affectedRefs).toEqual([
      { kind: "event", id: "evt_provider_preview" },
      { kind: "artifact", id: artifactHash, hash: artifactHash }
    ]);
    expect(cockpit.forbiddenDirectEffects).toContain("provider-byte-transfer");
    expect(JSON.stringify(cockpit)).not.toMatch(/raw-token|password|authorization:\s*bearer|sk_live/i);
  });

  it("marks locked provider approvals blocked and non-approvable", () => {
    const cockpit = buildAgentApprovalCockpit({
      status: agentStatus({
        toolRequests: [providerTransferRequest()],
        locks: [{
          lockId: "lock_provider_transfer",
          residentAgentId: "agent_default",
          kind: "provider-byte-transfer",
          activatedBy: "actor_case_owner",
          reason: "Provider transfer locked pending review.",
          activatedAt: "2026-07-08T13:55:00.000Z",
          relatedEventIds: ["evt_provider_preview"],
          state: "active",
          clearRelatedEventIds: [],
          eventIds: ["evt_lock_provider_transfer"],
          causationIds: []
        }],
        activeLockCount: 1
      }),
      generatedAt: "2026-07-08T14:00:00.000Z"
    });

    expect(cockpit.queue.pending).toHaveLength(0);
    expect(cockpit.queue.blocked[0]?.blockingReasons).toContain("lock-active");
    expect(cockpit.queue.blocked[0]?.executableByApproval).toBe(false);
  });

  it("marks missing provenance requests blocked with an explicit reason", () => {
    const cockpit = buildAgentApprovalCockpit({
      status: agentStatus({
        toolRequests: [providerTransferRequest({
          sourceEventIds: [],
          inputArtifactHashes: []
        })]
      }),
      generatedAt: "2026-07-08T14:00:00.000Z"
    });

    expect(cockpit.queue.pending).toHaveLength(0);
    expect(cockpit.queue.blocked[0]).toMatchObject({
      toolRequestId: "toolreq_provider_transfer",
      blockingReasons: expect.arrayContaining(["missing-provenance"]),
      staleness: {
        state: "current",
        approvable: false
      }
    });
    expect(cockpit.queue.blocked[0]?.review.riskAndLockStatus).toMatch(/missing provenance/i);
    expect(cockpit.queue.blocked[0]?.review.staleOrUnsafePrevention).toContain(
      "Requests without source-event and artifact provenance stay blocked until both provenance inputs are present."
    );
  });

  it("ignores read-only tool requests while keeping real approval requests visible", () => {
    const cockpit = buildAgentApprovalCockpit({
      status: agentStatus({
        toolRequests: [
          readOnlyRequest(),
          providerTransferRequest()
        ]
      }),
      generatedAt: "2026-07-08T14:00:00.000Z"
    });

    expect(cockpit.summary.pendingCount).toBe(1);
    expect(cockpit.queue.pending.map((item) => item.toolRequestId)).toEqual(["toolreq_provider_transfer"]);
    expect(
      [
        ...cockpit.queue.pending,
        ...cockpit.queue.resumable,
        ...cockpit.queue.blocked,
        ...cockpit.queue.stale,
        ...cockpit.queue.denied,
        ...cockpit.queue.completed,
        ...cockpit.queue.failed
      ].some((item) => item.toolRequestId === "toolreq_read_only")
    ).toBe(false);
  });

  it("projects approved denied completed and failed terminal buckets", () => {
    const approved = buildAgentApprovalCockpit({
      status: agentStatus({
        toolRequests: [providerTransferRequest({
          state: "approved",
          approvedBy: "actor_case_owner",
          approvedPreviewHash: previewHash,
          approvalClass: "provider-byte-transfer",
          approvalRationale: "Approved the exact provider preview.",
          approvedAt: "2026-07-08T14:01:00.000Z"
        })]
      }),
      generatedAt: "2026-07-08T14:02:00.000Z"
    });
    const denied = buildAgentApprovalCockpit({
      status: agentStatus({
        toolRequests: [providerTransferRequest({
          state: "denied",
          deniedBy: "actor_case_owner",
          denialRationale: "Needs a smaller evidence subset.",
          deniedAt: "2026-07-08T14:01:00.000Z"
        })]
      }),
      generatedAt: "2026-07-08T14:02:00.000Z"
    });
    const completed = buildAgentApprovalCockpit({
      status: agentStatus({
        toolRequests: [providerTransferRequest({
          state: "completed",
          completedAt: "2026-07-08T14:02:00.000Z",
          resultEventIds: ["evt_provider_result"],
          artifactHashes: [artifactHash],
          readModelChanges: [{ projectionName: "agent", change: "Recorded fixture result." }]
        })]
      }),
      generatedAt: "2026-07-08T14:03:00.000Z"
    });
    const failed = buildAgentApprovalCockpit({
      status: agentStatus({
        toolRequests: [providerTransferRequest({
          state: "failed",
          failedAt: "2026-07-08T14:03:00.000Z",
          failureCategory: "approval-stale",
          failureMessage: "Preview changed before resume.",
          retryable: false,
          allowedActions: ["request a revised preview"]
        })]
      }),
      generatedAt: "2026-07-08T14:04:00.000Z"
    });

    expect(approved.queue.resumable[0]?.approval?.approvedBy).toBe("actor_case_owner");
    expect(denied.queue.denied[0]?.denial?.rationale).toBe("Needs a smaller evidence subset.");
    expect(completed.queue.completed[0]?.completion?.eventIds).toEqual(["evt_provider_result"]);
    expect(failed.queue.failed[0]?.failure?.category).toBe("approval-stale");
  });

  it("rejects secret-shaped status text before building browser DTOs", () => {
    expect(() =>
      buildAgentApprovalCockpit({
        status: agentStatus({
          toolRequests: [providerTransferRequest({
            estimatedEffect: "Send bearer raw-token to provider."
          })]
        }),
        generatedAt: "2026-07-08T14:00:00.000Z"
      })
    ).toThrow(/secret|credential/i);
  });

  it("exports a strict decision result schema for route parsing", () => {
    const approvalCockpit = buildAgentApprovalCockpit({
      status: agentStatus({
        toolRequests: [providerTransferRequest()]
      }),
      generatedAt: "2026-07-08T14:00:00.000Z"
    });

    const result = {
      ok: true,
      schemaVersion: "agent-approval-decision-result.v1",
      eventIds: ["evt_agent_tool_approved"],
      approvalCockpit
    };

    expect(agentApprovalDecisionResultDtoSchema.parse(result)).toEqual(result);
    expect(() =>
      agentApprovalDecisionResultDtoSchema.parse({
        ...result,
        approvalCockpit: {
          ...approvalCockpit,
          queue: { pending: "nope" }
        }
      })
    ).toThrow(/queue/i);
  });

  it("rejects malformed cockpit queue payloads during parsing", () => {
    const cockpit = buildAgentApprovalCockpit({
      status: agentStatus({
        toolRequests: [providerTransferRequest()]
      }),
      generatedAt: "2026-07-08T14:00:00.000Z"
    });

    expect(() =>
      agentApprovalCockpitDtoSchema.parse({
        ...cockpit,
        queue: {
          ...cockpit.queue,
          blocked: [{
            ...cockpit.queue.pending[0],
            review: { ...cockpit.queue.pending[0]!.review, staleOrUnsafePrevention: "wrong" }
          }]
        }
      })
    ).toThrow(/staleOrUnsafePrevention/i);
  });

  it("parses future approval classes and direct-effect identifiers through canonical cockpit dto contracts", () => {
    const cockpit = buildAgentApprovalCockpit({
      status: agentStatus({
        toolRequests: [providerTransferRequest()]
      }),
      generatedAt: "2026-07-08T14:00:00.000Z"
    });

    const parsed = agentApprovalCockpitDtoSchema.parse({
      ...cockpit,
      decisionContract: {
        ...cockpit.decisionContract,
        forbiddenDirectEffects: ["provider-byte-transfer", "evidence-retention-review"]
      },
      approvalClasses: [{
        approvalClass: "evidence-retention-review",
        label: "Evidence retention review",
        requiredFor: "Reviews evidence retention actions before any decision is consumed.",
        rationale: {
          required: true,
          secretSafe: true
        }
      }],
      queue: {
        ...cockpit.queue,
        pending: [{
          ...cockpit.queue.pending[0]!,
          approvalClass: "evidence-retention-review",
          requiredApprovalClass: "evidence-retention-review",
          activeLocks: [{
            lockId: "lock_retention",
            category: "retention",
            message: "Retention review lock active.",
            appliesToApprovalClasses: ["evidence-retention-review"]
          }],
          risk: {
            ...cockpit.queue.pending[0]!.risk,
            approvalClass: "evidence-retention-review",
            activeLocks: [{
              lockId: "lock_retention",
              category: "retention",
              message: "Retention review lock active.",
              appliesToApprovalClasses: ["evidence-retention-review"]
            }]
          },
          approval: {
            toolRequestId: "toolreq_provider_transfer",
            approvedBy: "actor_case_owner",
            approvedPreviewHash: previewHash,
            approvedAt: "2026-07-08T14:01:00.000Z",
            rationale: "Approved retention review.",
            approvalClass: "evidence-retention-review"
          },
          denial: {
            toolRequestId: "toolreq_provider_transfer",
            deniedBy: "actor_case_owner",
            deniedAt: "2026-07-08T14:02:00.000Z",
            rationale: "Denied retention review.",
            approvalClass: "evidence-retention-review"
          },
          approvalContract: {
            ...cockpit.queue.pending[0]!.approvalContract,
            requiredApprovalClass: "evidence-retention-review"
          }
        }]
      },
      forbiddenDirectEffects: ["provider-byte-transfer", "evidence-retention-review"]
    });

    expect(parsed.approvalClasses[0]?.approvalClass).toBe("evidence-retention-review");
    expect(parsed.queue.pending[0]).toMatchObject({
      approvalClass: "evidence-retention-review",
      requiredApprovalClass: "evidence-retention-review",
      activeLocks: [{
        appliesToApprovalClasses: ["evidence-retention-review"]
      }],
      risk: {
        approvalClass: "evidence-retention-review"
      },
      approval: {
        approvalClass: "evidence-retention-review"
      },
      denial: {
        approvalClass: "evidence-retention-review"
      },
      approvalContract: {
        requiredApprovalClass: "evidence-retention-review"
      }
    });
    expect(parsed.decisionContract.forbiddenDirectEffects).toContain("evidence-retention-review");
    expect(parsed.forbiddenDirectEffects).toContain("evidence-retention-review");
  });

  it.each([
    "none",
    "human-review"
  ])("rejects sentinel approval class %s in canonical cockpit dto parsing", (approvalClass) => {
    const cockpit = buildAgentApprovalCockpit({
      status: agentStatus({
        toolRequests: [providerTransferRequest()]
      }),
      generatedAt: "2026-07-08T14:00:00.000Z"
    });

    expect(() =>
      agentApprovalCockpitDtoSchema.parse({
        ...cockpit,
        approvalClasses: [{
          ...cockpit.approvalClasses[0]!,
          approvalClass
        }]
      })
    ).toThrow(/approval class|direct effect/i);

    expect(() =>
      agentApprovalCockpitDtoSchema.parse({
        ...cockpit,
        queue: {
          ...cockpit.queue,
          pending: [{
            ...cockpit.queue.pending[0]!,
            approvalClass,
            requiredApprovalClass: approvalClass,
            activeLocks: [{
              lockId: "lock_provider_review",
              category: "review",
              message: "Waiting for review.",
              appliesToApprovalClasses: [approvalClass]
            }],
            risk: {
              ...cockpit.queue.pending[0]!.risk,
              approvalClass,
              activeLocks: [{
                lockId: "lock_provider_review",
                category: "review",
                message: "Waiting for review.",
                appliesToApprovalClasses: [approvalClass]
              }]
            },
            approval: {
              toolRequestId: "toolreq_provider_transfer",
              approvedBy: "actor_case_owner",
              approvedPreviewHash: previewHash,
              approvedAt: "2026-07-08T14:01:00.000Z",
              rationale: "Approved the review.",
              approvalClass
            },
            denial: {
              toolRequestId: "toolreq_provider_transfer",
              deniedBy: "actor_case_owner",
              deniedAt: "2026-07-08T14:02:00.000Z",
              rationale: "Denied the review.",
              approvalClass
            },
            approvalContract: {
              ...cockpit.queue.pending[0]!.approvalContract,
              requiredApprovalClass: approvalClass
            }
          }]
        }
      })
    ).toThrow(/approval class|direct effect/i);

    expect(() =>
      agentApprovalCockpitDtoSchema.parse({
        ...cockpit,
        decisionContract: {
          ...cockpit.decisionContract,
          forbiddenDirectEffects: ["provider-byte-transfer", approvalClass]
        }
      })
    ).toThrow(/approval class|direct effect/i);

    expect(() =>
      agentApprovalCockpitDtoSchema.parse({
        ...cockpit,
        forbiddenDirectEffects: ["provider-byte-transfer", approvalClass]
      })
    ).toThrow(/approval class|direct effect/i);
  });
});

function agentStatus(overrides: Partial<AgentStatusDto> = {}): AgentStatusDto {
  return {
    schemaVersion: "agent-status.v1",
    generatedAt: "2026-07-08T14:00:00.000Z",
    residentAgentId: "agent_default",
    tasks: [],
    runs: [],
    toolRequests: [],
    activeMemory: [],
    permissions: [],
    locks: [],
    providers: [],
    pendingApprovalCount: 0,
    activeLockCount: 0,
    diagnostics: [],
    ...overrides
  };
}

function providerTransferRequest(
  overrides: Partial<AgentStatusDto["toolRequests"][number]> = {}
): AgentStatusDto["toolRequests"][number] {
  return {
    toolRequestId: "toolreq_provider_transfer",
    runId: "run_provider_transfer",
    toolId: "provider.bytes.transfer",
    toolVersion: "1",
    requestedBy: "agent_default",
    sideEffectClass: "external-byte-transfer",
    requiredApprovalClass: "provider-byte-transfer",
    previewHash,
    scope: "Selected evidence excerpts for provider processing.",
    estimatedEffect: "Send selected evidence excerpts to the configured provider after approval.",
    state: "requested",
    requestedAt: "2026-07-08T13:59:00.000Z",
    sourceEventIds: ["evt_provider_preview"],
    inputArtifactHashes: [artifactHash],
    resultEventIds: [],
    artifactHashes: [],
    readModelChanges: [],
    allowedActions: [],
    eventIds: ["evt_agent_tool_requested_provider_transfer"],
    causationIds: ["evt_agent_run_started_provider_transfer"],
    ...overrides
  };
}

function readOnlyRequest(
  overrides: Partial<AgentStatusDto["toolRequests"][number]> = {}
): AgentStatusDto["toolRequests"][number] {
  return {
    toolRequestId: "toolreq_read_only",
    runId: "run_read_only",
    toolId: "workspace.inspect",
    toolVersion: "1",
    requestedBy: "agent_default",
    sideEffectClass: "read-only",
    requiredApprovalClass: "none",
    previewHash: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    scope: "Read workspace state for planning.",
    estimatedEffect: "Read-only workspace inspection with no external effects.",
    state: "requested",
    requestedAt: "2026-07-08T13:58:00.000Z",
    sourceEventIds: ["evt_read_only_preview"],
    inputArtifactHashes: [],
    resultEventIds: [],
    artifactHashes: [],
    readModelChanges: [],
    allowedActions: [],
    eventIds: ["evt_agent_tool_requested_read_only"],
    causationIds: ["evt_agent_run_started_read_only"],
    ...overrides
  };
}
