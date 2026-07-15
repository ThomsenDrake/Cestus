import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildResolvedContextPack,
  createContextPackRegistry,
  registerContextPackPayloadParserAuthority,
  type AgentContextPackJsonValue
} from "../../agent/src/context-packs.js";
import { consumeMountedProductionPromptReadbackWitness } from "../../agent/src/production-prompt-readback.js";
import { productionSpecialistPromptRegistrationFor, renderProductionSpecialistPrompt } from "../../agent/src/production-specialist-prompts.js";
import { createPortableWorkspace } from "../../workspace/src/index.js";
import { resolveLocalRuntimeConfig } from "../src/config.js";
import { createSqlitePrrRuntime, type LocalRuntimeHandle } from "../src/runtime-factory.js";
import { createMountedPromptArtifactStore } from "../src/mounted-prompt-artifact-store.js";

const dirs: string[] = [];
const handles: LocalRuntimeHandle[] = [];
const now = () => "2026-07-15T21:00:00.000Z";
const actor = { id: "actor_preapproval_test", kind: "human" as const, label: "Preapproval test" };

afterEach(() => {
  for (const handle of handles.splice(0)) handle.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("local runtime portable pre-approval prompt", () => {
  it("renders V1 once and checkpoints only after exact mounted readback", async () => {
    const handle = portableHandle("ws_preapproval_prompt");
    const prompt = await productionPrompt("ws_preapproval_prompt");
    const store = await createMountedPromptArtifactStore({ handle });
    await store.put(prompt);
    const readback = await store.read({ inputArtifactHash: prompt.manifest.inputArtifactHash as `sha256:${string}`, authoritativeResolvedContextPacks: prompt.resolvedContextPacks });
    if (readback.witness === undefined) throw new Error("Expected mounted V1 witness.");
    await expect(consumeMountedProductionPromptReadbackWitness(readback.witness, {
      ...expected(prompt, "ws_preapproval_prompt"),
      taskId: "task_swapped"
    })).rejects.toThrow(/task.*run.*scope|tuple/i);
    const consumed = await consumeMountedProductionPromptReadbackWitness(readback.witness, expected(prompt, "ws_preapproval_prompt"));
    expect(consumed.envelope.manifest.inputArtifactHash).toBe(prompt.manifest.inputArtifactHash);
  });

  it("fresh runtime rereads the durable V1 without rerendering", async () => {
    const root = portableRoot("ws_preapproval_restart");
    const prompt = await productionPrompt("ws_preapproval_restart");
    const first = portableHandle("ws_preapproval_restart", root);
    const firstStore = await createMountedPromptArtifactStore({ handle: first });
    await firstStore.put(prompt);
    const firstReadback = await firstStore.read({ inputArtifactHash: prompt.manifest.inputArtifactHash as `sha256:${string}`, authoritativeResolvedContextPacks: prompt.resolvedContextPacks });
    if (firstReadback.witness === undefined) throw new Error("Expected first mounted witness.");
    first.close();
    handles.splice(handles.indexOf(first), 1);

    const fresh = portableHandle("ws_preapproval_restart", root);
    const freshStore = await createMountedPromptArtifactStore({ handle: fresh });
    const recovered = await freshStore.read({ inputArtifactHash: prompt.manifest.inputArtifactHash as `sha256:${string}`, authoritativeResolvedContextPacks: prompt.resolvedContextPacks });
    if (recovered.witness === undefined) throw new Error("Expected fresh mounted witness.");
    expect(recovered.witness).not.toBe(firstReadback.witness);
    await expect(consumeMountedProductionPromptReadbackWitness(firstReadback.witness, expected(prompt, "ws_preapproval_restart")))
      .rejects.toThrow(/mount|process/i);
    await expect(consumeMountedProductionPromptReadbackWitness(recovered.witness, expected(prompt, "ws_preapproval_restart")))
      .resolves.toMatchObject({ envelope: { manifest: { inputArtifactHash: prompt.manifest.inputArtifactHash } } });
  });
});

function portableRoot(workspaceId: string): string {
  const root = mkdtempSync(join(tmpdir(), "cestus-preapproval-prompt-"));
  dirs.push(root);
  createPortableWorkspace({ rootDir: root, workspaceId, label: "Preapproval prompt", createdAt: now(), createdBy: actor.id });
  return root;
}

function portableHandle(workspaceId: string, root = portableRoot(workspaceId)): LocalRuntimeHandle {
  const cwd = mkdtempSync(join(tmpdir(), "cestus-preapproval-prompt-cwd-"));
  dirs.push(cwd);
  const handle = createSqlitePrrRuntime({
    config: {
      ...resolveLocalRuntimeConfig({ cwd, env: {} }),
      storage: { strategy: "portable-workspace", workspaceRoot: root, expectedWorkspaceId: workspaceId, sqlitePath: join(root, "ledger", "ontology.sqlite") }
    },
    actor,
    now
  });
  handles.push(handle);
  return handle;
}

async function productionPrompt(workspaceId: string) {
  const registry = createContextPackRegistry();
  const registration = productionSpecialistPromptRegistrationFor("evidence-triage");
  for (const requirement of registration.contextRequirements) {
    if (requirement.requirementMode !== "always") continue;
    const parser = (payload: AgentContextPackJsonValue) => payload;
    Object.defineProperty(parser, "cestusContextPackParserId", { value: requirement.contextPackId });
    registerContextPackPayloadParserAuthority(parser);
    registry.register({
      descriptor: { contextPackId: requirement.contextPackId, version: 1, label: requirement.contextPackId, maxBytes: 16_384, requiredProvenanceKinds: ["event-id"], redactionPolicy: "safe-summary", sourceProjection: "agent.test" },
      parsePayload: parser,
      build: () => buildResolvedContextPack({
        contextPackId: requirement.contextPackId,
        version: 1,
        generatedAt: now(),
        payload: usefulPayload(requirement.contextPackId),
        safeSummary: `Preapproval ${requirement.contextPackId}.`,
        provenanceRefs: ["evt_preapproval_fixture"]
      })
    });
  }
  const resolvedContextPacks = await Promise.all(registration.contextRequirements
    .filter((requirement) => requirement.requirementMode === "always")
    .map(async (requirement) => await registry.buildResolved(requirement.contextPackId)));
  return renderProductionSpecialistPrompt({
    taskId: "task_preapproval_prompt",
    runId: "run_preapproval_prompt",
    runType: "evidence-triage",
    generatedAt: now(),
    scope: { kind: "workspace", refs: [workspaceId] },
    resolvedContextPacks
  });
}

function expected(prompt: Awaited<ReturnType<typeof productionPrompt>>, workspaceId: string) {
  const production = prompt.manifest.production;
  if (production?.schemaVersion !== "agent-production-prompt-binding.v1") throw new Error("Expected production V1 prompt.");
  return {
    workspaceId,
    taskId: "task_preapproval_prompt",
    runId: "run_preapproval_prompt",
    runType: "evidence-triage" as const,
    scopeApplicabilityHash: production.scopeApplicabilityHash,
    contextPackRefs: prompt.manifest.contextPackRefs
  };
}

function usefulPayload(contextPackId: string): AgentContextPackJsonValue {
  switch (contextPackId) {
    case "accepted-graph-projection.v1": return { items: { assertions: [{ assertionId: "assertion_001", evidenceId: "ev_001", safeStatement: "Evidence requires review." }], entities: [], relationships: [] } };
    case "evidence-summary.v1": return { items: [{ evidenceId: "ev_001", ingestionEventId: "evt_ingested_001", contentHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111", safeNarrative: "Evidence is available." }] };
    case "governance-locks.v1": return { items: { activeLocks: [{ lockId: "lock_001", lockKind: "review", safeReason: "Human review.", activatedBy: "agent_test", activatedAt: now(), relatedEventIds: ["evt_lock_001"], projectionEventIds: ["evt_lock_001"] }], governanceRestrictions: [] } };
    case "agent-memory-summary.v1": return { memory: { activeMemory: ["Preserve review caveats."], aggregateCounts: { active: 1 }, sourceEventIds: ["evt_memory_001"], artifactHashes: [] } };
    case "task-run-history.v1": return { history: { projectionHighWaterMark: 1, projectionSourceRef: "agent.test", tasks: [{ taskId: "task_preapproval_prompt", status: "queued", statusReasonCode: "Awaiting review." }], runs: [], modelInvocations: [], toolRequests: [], aggregateCounts: { tasks: 1 }, sourceEventIds: ["evt_task_001"], artifactHashes: [] } };
    case "workspace-runtime-status.v1": return { runtime: { runtimeHighWaterMark: 1, workspaceMounted: true, storageStrategy: "portable-workspace", bindPosture: "bound", authPosture: "none", projectionHighWaterMarks: { agent: 1 }, omissionCodes: [] } };
    default: throw new Error(`Unexpected fixture context ${contextPackId}`);
  }
}
