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
    expect(rendered).toBeFrozen();
    expect(rendered.manifest).toBeFrozen();
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
});

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
      workflowDescriptor: productionSpecialistPromptRegistrationFor("evidence-triage") as never,
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
    "accepted-graph-projection.v1": { items: { assertions: [], entities: [], relationships: [] } },
    "evidence-summary.v1": { items: [{ evidenceId: "ev_runtime_001", ingestionEventId: "evt_runtime_001", contentHash: hash, occurrenceIds: [], parseJobs: [], governanceTags: [], safeNarrative: evidenceNarrative }] },
    "governance-locks.v1": { items: { activeLocks: [], governanceRestrictions: [] } },
    "agent-memory-summary.v1": { memory: { activeMemory: [], aggregateCounts: {}, sourceEventIds: ["evt_runtime_001"], artifactHashes: [] } },
    "task-run-history.v1": { history: { projectionHighWaterMark: 1, projectionSourceRef: "agent.projection", tasks: [], runs: [], modelInvocations: [], toolRequests: [], aggregateCounts: {}, sourceEventIds: ["evt_runtime_001"], artifactHashes: [], window: { order: "created-at", limit: 1, hasMore: false, totalCount: 0, omissionCodes: [] } } },
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
      .map(async (requirement) => await registry.buildResolved(requirement.contextPackId))
  );
}
