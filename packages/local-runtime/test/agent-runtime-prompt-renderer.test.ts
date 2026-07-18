import { describe, expect, it } from "vitest";
import {
  createContextPackRegistry,
  registerContextPackPayloadParserAuthority,
  type AgentContextPackJsonValue,
  type ContextPackRegistry,
  type VerifiedResolvedContextPack
} from "../../agent/src/context-packs.js";
import {
  productionSpecialistPromptRegistrationFor,
  renderProductionSpecialistPrompt,
  type BindApprovedProductionSpecialistPromptV2Input
} from "../../agent/src/production-specialist-prompts.js";
import { specialistWorkflowDescriptorFor } from "../../agent/src/specialist-workflows.js";
import { renderExactlyBoundProductionSpecialistPrompt } from "../src/agent-runtime-prompt-renderer.js";

const hash = "sha256:1111111111111111111111111111111111111111111111111111111111";

describe("Task133 strict runtime prompt renderer", () => {
  it("binds one registered approved prompt to the exact run, provider posture, and verified context hashes", async () => {
    const input = await exactBinding();

    const rendered = renderExactlyBoundProductionSpecialistPrompt(input);
    const production = rendered.manifest.production;

    expect(production).toMatchObject({
      schemaVersion: "agent-production-prompt-binding.v2",
      exactRunBinding: {
        taskId: "task_runtime_001",
        attemptId: "attempt_runtime_001",
        approvedRunId: "approved_runtime_001",
        runId: "run_runtime_001",
        residentAgentId: "agent_default",
        workspaceId: "workspace_runtime_001",
        mountInstanceId: "mount_runtime_001",
        policyVersion: "policy_runtime_001",
        providerPosture: {
          providerId: "provider_runtime_001",
          modelId: "model_runtime_001",
          capabilityIds: ["capability_runtime_001"],
          readinessState: "ready"
        }
      },
      resolvedPayloadAudits: input.approvedPromptArtifact.manifest.production?.resolvedPayloadAudits
    });
    expect(Object.isFrozen(rendered)).toBe(true);
    expect(Object.isFrozen(rendered.manifest)).toBe(true);
    expect(JSON.stringify(rendered.manifest)).not.toContain(rendered.text);
  });

  it("fails closed before producing a V2 artifact for forged, stale, or mismatched run, posture, and context bindings", async () => {
    const input = await exactBinding("RENDERER_RAW_BYTES_SENTINEL");
    const forgedSource = structuredClone(input.approvedPromptArtifact);
    const staleContexts = await resolvedPacks(rendererRegistry("different verified context"));
    const invalids: readonly BindApprovedProductionSpecialistPromptV2Input[] = [
      { ...input, approvedPromptArtifact: forgedSource },
      { ...input, resolvedContextPacks: staleContexts },
      { ...input, exactRun: { ...input.exactRun, runType: "timeline-builder" } },
      { ...input, exactRun: { ...input.exactRun, providerPosture: { ...input.exactRun.providerPosture, readinessState: "unavailable" } as never } }
    ];

    for (const invalid of invalids) {
      let message = "";
      try {
        renderExactlyBoundProductionSpecialistPrompt(invalid);
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }
      expect(message).toBe("prompt-binding-invalid");
      expect(message).not.toContain("RENDERER_RAW_BYTES_SENTINEL");
    }
  });

  it("rejects hostile accessor, symbol, extra-key, and forged nested inputs before binding", async () => {
    const input = await exactBinding("RENDERER_RAW_BYTES_SENTINEL");
    const outerAccessor = { ...input };
    Object.defineProperty(outerAccessor, "approvedPromptArtifact", {
      enumerable: true,
      get: () => input.approvedPromptArtifact
    });
    const outerSymbol = { ...input };
    Object.defineProperty(outerSymbol, Symbol("forged"), { enumerable: true, value: "forged" });
    const exactRunAccessor = { ...input, exactRun: { ...input.exactRun } };
    Object.defineProperty(exactRunAccessor.exactRun, "taskId", {
      enumerable: true,
      get: () => input.exactRun.taskId
    });
    const postureAccessor = { ...input, exactRun: { ...input.exactRun, providerPosture: { ...input.exactRun.providerPosture } } };
    Object.defineProperty(postureAccessor.exactRun.providerPosture, "providerId", {
      enumerable: true,
      get: () => input.exactRun.providerPosture.providerId
    });
    const forgedContext = { ...input, resolvedContextPacks: [{ ...input.resolvedContextPacks[0]! }] };
    const invalids: readonly unknown[] = [
      outerAccessor,
      outerSymbol,
      { ...input, unexpected: "forged" },
      exactRunAccessor,
      { ...input, exactRun: { ...input.exactRun, unexpected: "forged" } },
      postureAccessor,
      { ...input, exactRun: { ...input.exactRun, providerPosture: { ...input.exactRun.providerPosture, unexpected: "forged" } } },
      forgedContext
    ];

    for (const invalid of invalids) {
      const message = renderFailure(invalid);
      expect(message).toBe("prompt-binding-invalid");
      expect(message).not.toContain("RENDERER_RAW_BYTES_SENTINEL");
    }
  });
});

function renderFailure(input: unknown): string {
  try {
    Reflect.apply(renderExactlyBoundProductionSpecialistPrompt, undefined, [input]);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return "rendered";
}

async function exactBinding(evidenceNarrative = "Verified evidence is ready for review."): Promise<BindApprovedProductionSpecialistPromptV2Input> {
  const registry = rendererRegistry(evidenceNarrative);
  const resolvedContextPacks = await resolvedPacks(registry);
  const scope = { kind: "imported-evidence", refs: ["ev_runtime_001"] } as const;
  const approvedPromptArtifact = renderProductionSpecialistPrompt({
    taskId: "task_runtime_001",
    runId: "run_runtime_001",
    runType: "evidence-triage",
    generatedAt: "2026-07-18T12:00:00.000Z",
    scope,
    resolvedContextPacks
  });
  return {
    approvedPromptArtifact,
    generatedAt: "2026-07-18T12:00:01.000Z",
    scope,
    resolvedContextPacks,
    exactRun: {
      taskId: "task_runtime_001",
      attemptId: "attempt_runtime_001",
      approvedRunId: "approved_runtime_001",
      runId: "run_runtime_001",
      runType: "evidence-triage",
      residentAgentId: "agent_default",
      workspaceId: "workspace_runtime_001",
      mountInstanceId: "mount_runtime_001",
      workflowDescriptor: specialistWorkflowDescriptorFor("evidence-triage"),
      policyVersion: "policy_runtime_001",
      providerPosture: {
        providerId: "provider_runtime_001",
        modelId: "model_runtime_001",
        capabilityIds: ["capability_runtime_001"],
        selectionPolicyVersion: "selection_policy_runtime_001",
        readinessState: "ready",
        approvalRequirementId: "approval_runtime_001"
      }
    }
  };
}

function rendererRegistry(evidenceNarrative: string): ContextPackRegistry {
  const registry = createContextPackRegistry();
  const payloads: Readonly<Record<string, AgentContextPackJsonValue>> = {
    "accepted-graph-projection.v1": { items: { assertions: [{ assertionId: "assertion_runtime_001", evidenceId: "ev_runtime_001", evidenceContentHash: hash, proposedByEventId: "evt_runtime_001", acceptedByEventId: "evt_runtime_002", sourceEventIds: ["evt_runtime_001"], rowHash: hash, safeStatement: "Verified runtime assertion." }], entities: [], relationships: [] } },
    "evidence-summary.v1": { items: [{ evidenceId: "ev_runtime_001", ingestionEventId: "evt_runtime_001", contentHash: hash, occurrenceIds: [], parseJobs: [], governanceTags: [], safeNarrative: evidenceNarrative }] },
    "governance-locks.v1": { items: { activeLocks: [{ lockId: "lock_runtime_001", lockKind: "review", safeReason: "Review required.", activatedBy: "agent_default", activatedAt: "2026-07-18T12:00:00.000Z", relatedEventIds: ["evt_runtime_001"], projectionEventIds: ["evt_runtime_001"] }], governanceRestrictions: [] } },
    "agent-memory-summary.v1": { memory: { activeMemory: ["Verified runtime memory."], aggregateCounts: { active: 1 }, sourceEventIds: ["evt_runtime_001"], artifactHashes: [] } },
    "task-run-history.v1": { history: { projectionHighWaterMark: 1, projectionSourceRef: "agent.projection", tasks: [{ taskId: "task_runtime_001", status: "queued", statusReasonCode: "Awaiting review." }], runs: [], modelInvocations: [], toolRequests: [], aggregateCounts: { tasks: 1 }, sourceEventIds: ["evt_runtime_001"], artifactHashes: [], window: { order: "created-at", limit: 1, hasMore: false, totalCount: 1, omissionCodes: [] } } },
    "workspace-runtime-status.v1": { runtime: { runtimeHighWaterMark: 1, workspaceMounted: true, storageStrategy: "local", bindPosture: "bound", authPosture: "none", providerStates: [], diagnostics: [], projectionHighWaterMarks: {}, omissionCodes: [] } }
  };
  for (const [contextPackId, payload] of Object.entries(payloads)) {
    const parser = (value: AgentContextPackJsonValue): AgentContextPackJsonValue => value;
    Object.defineProperty(parser, "cestusContextPackParserId", { value: contextPackId });
    registerContextPackPayloadParserAuthority(parser);
    registry.register({
      descriptor: {
        contextPackId,
        version: 1,
        label: contextPackId,
        maxBytes: 16_384,
        requiredProvenanceKinds: ["event-id"],
        redactionPolicy: "safe-summary",
        sourceProjection: "agent.projection"
      },
      build: () => ({
        contextPackId,
        version: 1,
        generatedAt: "2026-07-18T12:00:00.000Z",
        payload,
        safeSummary: "Verified runtime context.",
        provenanceRefs: ["evt_runtime_001"]
      }),
      parsePayload: parser
    });
  }
  return registry;
}

async function resolvedPacks(registry: ContextPackRegistry): Promise<readonly VerifiedResolvedContextPack[]> {
  return await Promise.all(
    productionSpecialistPromptRegistrationFor("evidence-triage").contextRequirements
      .filter((requirement) => requirement.requirementMode === "always")
      .map(async (requirement) => await registry.buildResolved(requirement.contextPackId))
  );
}
