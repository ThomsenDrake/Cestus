import { describe, expect, it } from "vitest";
import {
  buildResolvedContextPack,
  createContextPackRegistry,
  registerContextPackPayloadParserAuthority,
  type AgentContextPackJsonValue
} from "../src/context-packs.js";
import { serializePromptArtifactEnvelope } from "../src/prompt-artifacts.js";
import {
  productionSpecialistPromptRegistrationFor,
  renderProductionSpecialistPrompt
} from "../src/production-specialist-prompts.js";
import {
  consumeMountedProductionPromptReadbackWitness,
  registerMountedProductionPromptReadback
} from "../src/production-prompt-readback.js";

describe("mounted production prompt readback authority", () => {
  it("rejects structurally valid v1 without mounted readback membership", () => {
    const structural = {
      schemaVersion: "agent-mounted-production-prompt-readback.v1",
      inputArtifactHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      workspaceId: "ws_readback_test",
      mountInstanceId: "process_readback_test"
    } as const;

    expect(() => consumeMountedProductionPromptReadbackWitness(structural)).toThrow(/mounted.*prompt.*readback|required/i);
  });

  it("rejects copied swapped and reused mounted readback witness", async () => {
    const envelope = await promptEnvelope();
    const witness = registerMountedProductionPromptReadback({
      envelope,
      serializedEnvelope: serializePromptArtifactEnvelope(envelope),
      authoritativeResolvedContextPacks: envelope.resolvedContextPacks,
      taskId: "task_readback_test",
      runId: "run_readback_test",
      runType: "evidence-triage",
      generatedAt: "2026-07-15T21:00:00.000Z",
      scope: { kind: "workspace", refs: ["ws_readback_test"] },
      contextPackRefs: envelope.manifest.contextPackRefs,
      workspaceId: "ws_readback_test",
      rootDir: "/portable/ws_readback_test",
      blobRoot: "/portable/ws_readback_test/blobs",
      mountInstanceId: "process_readback_test"
    });

    expect(() => consumeMountedProductionPromptReadbackWitness({ ...witness })).toThrow(/mounted.*prompt.*readback|required/i);
    expect(consumeMountedProductionPromptReadbackWitness(witness).envelope.manifest.inputArtifactHash)
      .toBe(envelope.manifest.inputArtifactHash);
    expect(() => consumeMountedProductionPromptReadbackWitness(witness)).toThrow(/consumed/i);
  });
});

async function promptEnvelope() {
  const registry = createContextPackRegistry();
  const registration = productionSpecialistPromptRegistrationFor("evidence-triage");
  for (const requirement of registration.contextRequirements) {
    if (requirement.requirementMode !== "always") continue;
    const parser = (payload: AgentContextPackJsonValue) => payload;
    Object.defineProperty(parser, "cestusContextPackParserId", { value: requirement.contextPackId });
    registerContextPackPayloadParserAuthority(parser);
    registry.register({
      descriptor: {
        contextPackId: requirement.contextPackId,
        version: 1,
        label: `Readback ${requirement.contextPackId}`,
        maxBytes: 16_384,
        requiredProvenanceKinds: ["event-id"],
        redactionPolicy: "safe-summary",
        sourceProjection: "agent.test"
      },
      parsePayload: parser,
      build: () => buildResolvedContextPack({
        contextPackId: requirement.contextPackId,
        version: 1,
        generatedAt: "2026-07-15T21:00:00.000Z",
        payload: providerUsefulPayload(requirement.contextPackId),
        safeSummary: `Readback ${requirement.contextPackId} context.`,
        provenanceRefs: ["evt_readback_fixture"]
      })
    });
  }
  const resolvedContextPacks = await Promise.all(registration.contextRequirements
    .filter((requirement) => requirement.requirementMode === "always")
    .map(async (requirement) => await registry.buildResolved(requirement.contextPackId)));
  return renderProductionSpecialistPrompt({
    taskId: "task_readback_test",
    runId: "run_readback_test",
    runType: "evidence-triage",
    generatedAt: "2026-07-15T21:00:00.000Z",
    scope: { kind: "workspace", refs: ["ws_readback_test"] },
    resolvedContextPacks
  });
}

function providerUsefulPayload(contextPackId: string): AgentContextPackJsonValue {
  switch (contextPackId) {
    case "accepted-graph-projection.v1":
      return { items: { assertions: [{ assertionId: "assertion_001", evidenceId: "ev_001", safeStatement: "Reviewed evidence needs human review." }], entities: [], relationships: [] } };
    case "evidence-summary.v1":
      return { items: [{ evidenceId: "ev_001", ingestionEventId: "evt_ingested_001", contentHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111", safeNarrative: "Evidence is available for review." }] };
    case "governance-locks.v1":
      return { items: { activeLocks: [{ lockId: "lock_001", lockKind: "review", safeReason: "Human review required.", activatedBy: "agent_test", activatedAt: "2026-07-15T21:00:00.000Z", relatedEventIds: ["evt_lock_001"], projectionEventIds: ["evt_lock_001"] }], governanceRestrictions: [] } };
    case "agent-memory-summary.v1":
      return { memory: { activeMemory: ["Preserve review caveats."], aggregateCounts: { active: 1 }, sourceEventIds: ["evt_memory_001"], artifactHashes: [] } };
    case "task-run-history.v1":
      return { history: { projectionHighWaterMark: 1, projectionSourceRef: "agent.test", tasks: [{ taskId: "task_readback_test", status: "queued", statusReasonCode: "Awaiting review." }], runs: [], modelInvocations: [], toolRequests: [], aggregateCounts: { tasks: 1 }, sourceEventIds: ["evt_task_001"], artifactHashes: [] } };
    case "workspace-runtime-status.v1":
      return { runtime: { runtimeHighWaterMark: 1, workspaceMounted: true, storageStrategy: "portable-workspace", bindPosture: "bound", authPosture: "none", projectionHighWaterMarks: { agent: 1 }, omissionCodes: [] } };
    default:
      throw new Error(`Unexpected readback context pack ${contextPackId}`);
  }
}
