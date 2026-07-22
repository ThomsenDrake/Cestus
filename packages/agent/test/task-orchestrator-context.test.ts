import { describe, expect, it, vi } from "vitest";
import {
  buildContextPackRef,
  createContextPackRegistry,
  registerContextPackPayloadParserAuthority,
  type AgentContextPackJsonValue,
  type ContextPackDescriptor,
  type ContextPackRegistry
} from "../src/context-packs.js";
import {
  assembleTaskOrchestratorContext,
  assertTaskOrchestratorContextHasNoPayloadBytes
} from "../src/task-orchestrator-context.js";
import { specialistWorkflowDescriptorFor } from "../src/specialist-workflows.js";

const payloadMarker = "task-4-resolved-payload-must-stay-local";
const descriptor = specialistWorkflowDescriptorFor("evidence-triage");
const scope = { kind: "workspace" as const, refs: ["ws_task4"] };

describe("resident task orchestrator context assembly", () => {
  it("uses workflow applicability to skip prr-read-model for non prr evidence triage", async () => {
    const registry = contextRegistry();
    const buildResolved = vi.fn(registry.buildResolved);
    const trackedRegistry = { ...registry, buildResolved };

    const assembled = await assembleTaskOrchestratorContext({
      taskId: "task_task4_non_prr",
      runType: "evidence-triage",
      scope,
      workflow: descriptor,
      contextRegistry: trackedRegistry
    });

    expect(assembled.dispatchReady).toBe(true);
    expect(assembled.inapplicable).toContainEqual({
      contextPackId: "prr-read-model.v1",
      reason: "no-associated-prr"
    });
    expect(buildResolved).not.toHaveBeenCalledWith("prr-read-model.v1");
  });

  it("rejects a trimmed caller supplied workflow descriptor before declaring dispatch ready", async () => {
    await expect(assembleTaskOrchestratorContext({
      taskId: "task_task4_trimmed_workflow",
      runType: "evidence-triage",
      scope,
      workflow: onlyEvidenceSummaryWorkflow(),
      contextRegistry: contextRegistry()
    })).rejects.toThrow(/canonical|workflow/i);
  });

  it("rejects a caller supplied workflow descriptor with unknown context requirements", async () => {
    await expect(assembleTaskOrchestratorContext({
      taskId: "task_task4_unknown_workflow_requirement",
      runType: "evidence-triage",
      scope,
      workflow: {
        ...descriptor,
        contextPacks: [...descriptor.contextPacks, {
          contextPackId: "unknown-context.v1",
          requirementMode: "always",
          purpose: "Forged requirement outside production registration."
        }]
      },
      contextRegistry: contextRegistry()
    })).rejects.toThrow(/canonical|workflow/i);
  });

  it("rejects an associated PRR that is absent from scope refs", async () => {
    await expect(assembleTaskOrchestratorContext({
      taskId: "task_task4_prr_scope_mismatch",
      runType: "evidence-triage",
      scope: {
        kind: "workspace",
        refs: ["ws_task4"],
        associatedPrrRequestId: "prr_task4"
      },
      workflow: descriptor,
      contextRegistry: contextRegistry()
    })).rejects.toThrow(/associated PRR|scope refs/i);
  });

  it("blocks before transfer when an applicable context ref cannot be resolved locally", async () => {
    const registry = contextRegistry();
    const failingRegistry = { ...registry, buildResolved: async () => { throw new Error("blocked.missing-payload"); } };

    await expect(assembleTaskOrchestratorContext({
      taskId: "task_task4_missing_payload",
      runType: "evidence-triage",
      scope,
      workflow: descriptor,
      contextRegistry: failingRegistry
    })).rejects.toThrow(/resolved|payload/i);
  });

  it("blocks before transfer when content hash does not match resolved payload bytes", async () => {
    const mismatchRegistry = createContextPackRegistry({
      payloadResolver: () => ({ marker: "different-payload" })
    });
    mismatchRegistry.register({
      descriptor: contextDescriptor("evidence-summary.v1"),
      build: () => buildContextPackRef({
        contextPackId: "evidence-summary.v1",
        version: 1,
        generatedAt: "2026-07-12T05:00:00.000Z",
        payload: { marker: payloadMarker, contextPackId: "evidence-summary.v1" },
        safeSummary: "Safe evidence-summary.v1 context metadata.",
        provenanceRefs: ["evt_task4_context"]
      }),
      parsePayload: productionParser("evidence-summary.v1")
    });

    await expect(assembleTaskOrchestratorContext({
      taskId: "task_task4_hash_mismatch",
      runType: "evidence-triage",
      scope,
      workflow: descriptor,
      contextRegistry: mismatchRegistry
    })).rejects.toThrow(/payload-hash-mismatch|hash/i);
  });

  it("blocks before transfer when resolved schema id differs from descriptor schema", async () => {
    const registry = contextRegistry();
    const wrongSchema = await registry.buildResolved("governance-locks.v1");
    const ref = await registry.build("evidence-summary.v1");
    const fakeRegistry = {
      ...registry,
      build: async () => ref,
      buildResolved: async () => wrongSchema
    };

    await expect(assembleTaskOrchestratorContext({
      taskId: "task_task4_schema_mismatch",
      runType: "evidence-triage",
      scope,
      workflow: descriptor,
      contextRegistry: fakeRegistry as never
    })).rejects.toThrow(/schema|descriptor|context pack/i);
  });

  it("blocks before transfer when resolved byte size differs from descriptor", async () => {
    const registry = contextRegistry();
    const resolved = await registry.buildResolved("evidence-summary.v1");
    const ref = await registry.build("evidence-summary.v1");
    const fakeRegistry = {
      ...registry,
      build: async () => ref,
      buildResolved: async () => resolved,
      getDescriptor: () => ({ ...registry.getDescriptor("evidence-summary.v1")!, maxBytes: 1 })
    };

    await expect(assembleTaskOrchestratorContext({
      taskId: "task_task4_size_mismatch",
      runType: "evidence-triage",
      scope,
      workflow: descriptor,
      contextRegistry: fakeRegistry as never
    })).rejects.toThrow(/size|byte|budget/i);
  });

  it("passes verified resolved payload bytes to prompt renderer", async () => {
    const renderer = vi.fn();
    const assembled = await assembleTaskOrchestratorContext({
      taskId: "task_task4_renderer_payload",
      attemptId: "attempt_task4_renderer_payload",
      generatedAt: "2026-07-15T21:00:00.000Z",
      runType: "evidence-triage",
      scope,
      workflow: descriptor,
      contextRegistry: contextRegistry(),
      renderPrompt: renderer
    });

    expect(assembled.dispatchReady).toBe(true);
    expect(renderer).toHaveBeenCalledOnce();
    expect(renderer.mock.calls[0]?.[0].resolvedContextPacks[0]?.payload).toMatchObject({ marker: payloadMarker });
  });

  it("requires attempt id and generated at before context rendering", async () => {
    const renderer = vi.fn();

    await assembleTaskOrchestratorContext({
      taskId: "task_task4_render_snapshot",
      attemptId: "attempt_task4_render_snapshot",
      generatedAt: "2026-07-15T21:00:00.000Z",
      runType: "evidence-triage",
      scope,
      workflow: descriptor,
      contextRegistry: contextRegistry(),
      renderPrompt: renderer
    });

    expect(renderer).toHaveBeenCalledWith(expect.objectContaining({
      taskId: "task_task4_render_snapshot",
      attemptId: "attempt_task4_render_snapshot",
      generatedAt: "2026-07-15T21:00:00.000Z"
    }));
  });

  it("does not build context refs separately from resolved payload verification", async () => {
    const registry = contextRegistry();
    const trackedRegistry = {
      ...registry,
      build: vi.fn(registry.build),
      buildResolved: vi.fn(registry.buildResolved)
    };

    const assembled = await assembleTaskOrchestratorContext({
      taskId: "task_task4_resolved_once",
      runType: "evidence-triage",
      scope,
      workflow: descriptor,
      contextRegistry: trackedRegistry
    });

    expect(assembled.applicableContextPackRefs).toEqual(
      assembled.resolvedContextPacks.map((resolved) => resolved.ref)
    );
    expect(trackedRegistry.build).not.toHaveBeenCalled();
    expect(trackedRegistry.buildResolved).toHaveBeenCalledTimes(6);
    expect(trackedRegistry.buildResolved).toHaveBeenCalledWith("evidence-summary.v1");
    expect(trackedRegistry.buildResolved).not.toHaveBeenCalledWith("prr-read-model.v1");
  });

  it("records only refs hashes sizes schemas and provenance in checkpoints", async () => {
    const assembled = await readyContext();

    expect(assembled.checkpointContextBindings[0]).toEqual(expect.objectContaining({
      contextPackId: "evidence-summary.v1",
      ref: expect.objectContaining({ contentHash: expect.stringMatching(/^sha256:/) }),
      contentHash: expect.stringMatching(/^sha256:/),
      byteLength: expect.any(Number),
      schemaId: "evidence-summary.v1",
      provenanceEventIds: ["evt_task4_context"]
    }));
    assertTaskOrchestratorContextHasNoPayloadBytes(
      assembled.checkpointContextBindings,
      assembled.resolvedContextPacks
    );
  });

  it("rejects ref only fake dispatch readiness", async () => {
    const registry = contextRegistry();
    const ref = await registry.build("evidence-summary.v1");
    const fakeRegistry = { ...registry, build: async () => ref, buildResolved: async () => ref };

    await expect(assembleTaskOrchestratorContext({
      taskId: "task_task4_ref_only",
      runType: "evidence-triage",
      scope,
      workflow: descriptor,
      contextRegistry: fakeRegistry as never
    })).rejects.toThrow(/verified|payload|resolved/i);
  });

  it("rejects caller supplied ok verified or parserVerification fields as execution proof", async () => {
    const registry = contextRegistry();
    const ref = await registry.build("evidence-summary.v1");
    const fakeRegistry = {
      ...registry,
      build: async () => ref,
      buildResolved: async () => ({ ref, payload: { marker: payloadMarker }, ok: true, verified: true, parserVerification: true })
    };

    await expect(assembleTaskOrchestratorContext({
      taskId: "task_task4_forged_proof",
      runType: "evidence-triage",
      scope,
      workflow: descriptor,
      contextRegistry: fakeRegistry as never
    })).rejects.toThrow(/verified|proof|resolved/i);
  });
});

async function readyContext() {
  return await assembleTaskOrchestratorContext({
    taskId: "task_task4_ready_context",
    runType: "evidence-triage",
    scope,
    workflow: descriptor,
    contextRegistry: contextRegistry()
  });
}

function onlyEvidenceSummaryWorkflow() {
  return { ...descriptor, contextPacks: descriptor.contextPacks.filter((pack) => pack.contextPackId === "evidence-summary.v1") };
}

function contextRegistry(): ContextPackRegistry {
  const registry = createContextPackRegistry();
  for (const requirement of descriptor.contextPacks) {
    registry.register({
      descriptor: contextDescriptor(requirement.contextPackId),
      build: () => ({
        contextPackId: requirement.contextPackId,
        version: 1,
        generatedAt: "2026-07-12T05:00:00.000Z",
        payload: { marker: payloadMarker, contextPackId: requirement.contextPackId },
        safeSummary: `Safe ${requirement.contextPackId} context metadata.`,
        provenanceRefs: ["evt_task4_context"]
      }),
      parsePayload: productionParser(requirement.contextPackId)
    });
  }
  return registry;
}

function productionParser(contextPackId: string) {
  const parser = (payload: AgentContextPackJsonValue) => payload;
  Object.defineProperty(parser, "cestusContextPackParserId", {
    value: contextPackId,
    enumerable: false,
    writable: false,
    configurable: false
  });
  registerContextPackPayloadParserAuthority(parser);
  return parser;
}

function contextDescriptor(contextPackId: string): ContextPackDescriptor {
  return {
    contextPackId,
    version: 1,
    label: `Task 4 ${contextPackId}`,
    maxBytes: 16_384,
    requiredProvenanceKinds: ["event-id"],
    redactionPolicy: "safe-summary",
    sourceProjection: "agent.projection"
  };
}
