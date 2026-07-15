import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildContextPackRef,
  buildResolvedContextPack,
  createContextPackRegistry,
  registerContextPackPayloadParserAuthority,
  type AgentContextPackJsonValue
} from "../../agent/src/context-packs.js";
import { buildPromptArtifact } from "../../agent/src/prompt-artifacts.js";
import {
  productionSpecialistPromptRegistrationFor,
  renderProductionSpecialistPrompt
} from "../../agent/src/production-specialist-prompts.js";
import { createPortableWorkspace } from "../../workspace/src/index.js";
import { resolveLocalRuntimeConfig } from "../src/config.js";
import { createMountedPromptArtifactStore } from "../src/mounted-prompt-artifact-store.js";
import { createSqlitePrrRuntime } from "../src/runtime-factory.js";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("mounted prompt artifact store", () => {
  it("constructs resident prompt store only for a verified portable mount", async () => {
    const local = createSqlitePrrRuntime({
      config: resolveLocalRuntimeConfig({ cwd: tempDir("cestus-local-prompt-store-"), env: {} }),
      actor: { id: "actor_store", kind: "human", label: "Store test" },
      now: () => "2026-07-15T21:00:00.000Z"
    });
    try {
      await expect(createMountedPromptArtifactStore({ handle: local })).rejects.toThrow(/portable|mounted/i);
    } finally {
      local.close();
    }
  });

  it("revalidates workspace root and blob tuple before and after every io", async () => {
    const handle = portableHandle();
    try {
      const store = await createMountedPromptArtifactStore({ handle });
      const prompt = promptEnvelope();
      await store.put(prompt);
      await expect(store.read({ inputArtifactHash: prompt.manifest.inputArtifactHash as `sha256:${string}` })).resolves.toMatchObject({
        envelope: { manifest: { inputArtifactHash: prompt.manifest.inputArtifactHash } }
      });
    } finally {
      handle.close();
    }
  });

  it("derives the production readback tuple from canonical mounted V1 bytes", async () => {
    const handle = portableHandle();
    try {
      const store = await createMountedPromptArtifactStore({ handle });
      const prompt = await productionPromptEnvelope();
      await store.put(prompt);

      const readback = await store.read({
        inputArtifactHash: prompt.manifest.inputArtifactHash as `sha256:${string}`,
        authoritativeResolvedContextPacks: prompt.resolvedContextPacks
      });

      expect(readback.envelope.manifest.production).toMatchObject({
        schemaVersion: "agent-production-prompt-binding.v1",
        scopeApplicabilityHash: expect.stringMatching(/^sha256:/)
      });
      expect(readback.witness).toEqual(expect.objectContaining({
        inputArtifactHash: prompt.manifest.inputArtifactHash,
        workspaceId: "ws_prompt_store_test"
      }));
    } finally {
      handle.close();
    }
  });

  it("accepts EEXIST only for byte-identical canonical envelope", async () => {
    const handle = portableHandle();
    try {
      const store = await createMountedPromptArtifactStore({ handle });
      const prompt = promptEnvelope();
      await store.put(prompt);
      await expect(store.put(prompt)).resolves.toMatchObject({ inputArtifactHash: prompt.manifest.inputArtifactHash });
    } finally {
      handle.close();
    }
  });

  it("rejects unequal EEXIST bytes rather than replacing the mounted artifact", async () => {
    const handle = portableHandle();
    try {
      const store = await createMountedPromptArtifactStore({ handle });
      const prompt = promptEnvelope();
      await store.put(prompt);
      const digest = prompt.manifest.inputArtifactHash.slice("sha256:".length);
      writeFileSync(join(handle.mountedWorkspace!.paths.blobRoot, "agent-prompt-artifacts", "sha256", digest.slice(0, 2), `${digest}.json`), "corrupt");
      await expect(store.put(prompt)).rejects.toThrow(/EEXIST.*differ/i);
    } finally {
      handle.close();
    }
  });

  it("rejects corrupt or hash-mismatched readback without fallback", async () => {
    const handle = portableHandle();
    try {
      const store = await createMountedPromptArtifactStore({ handle });
      await expect(store.read({
        inputArtifactHash: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
      })).rejects.toThrow(/not found|readback|prompt/i);
    } finally {
      handle.close();
    }
  });

  it("rejects accessor, prototype, symbol, and sparse caller input before it becomes authority", async () => {
    const handle = portableHandle();
    try {
      const store = await createMountedPromptArtifactStore({ handle });
      let getterCalls = 0;
      const accessor = {};
      Object.defineProperty(accessor, "inputArtifactHash", {
        enumerable: true,
        get() { getterCalls += 1; return "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"; }
      });
      await expect(store.read(accessor as never)).rejects.toThrow(/data|canonical/i);
      expect(getterCalls).toBe(0);

      const inherited = Object.create({ inputArtifactHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" });
      await expect(store.read(inherited)).rejects.toThrow(/plain|unexpected|canonical/i);

      const symbol = Symbol("extra");
      const withSymbol = { inputArtifactHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" } as Record<PropertyKey, unknown>;
      withSymbol[symbol] = true;
      await expect(store.read(withSymbol as never)).rejects.toThrow(/plain|unexpected/i);

      const sparse: unknown[] = [];
      sparse.length = 2;
      sparse[1] = {};
      await expect(store.read({ inputArtifactHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", authoritativeResolvedContextPacks: sparse as never }))
        .rejects.toThrow(/dense|data/i);
    } finally {
      handle.close();
    }
  });
});

function portableHandle() {
  const root = tempDir("cestus-portable-prompt-store-");
  createPortableWorkspace({
    rootDir: root,
    workspaceId: "ws_prompt_store_test",
    label: "Prompt store test",
    createdAt: "2026-07-15T21:00:00.000Z",
    createdBy: "actor_store"
  });
  const cwd = tempDir("cestus-prompt-store-cwd-");
  return createSqlitePrrRuntime({
    config: {
      ...resolveLocalRuntimeConfig({ cwd, env: {} }),
      storage: {
        strategy: "portable-workspace",
        workspaceRoot: root,
        expectedWorkspaceId: "ws_prompt_store_test",
        sqlitePath: join(root, "ledger", "ontology.sqlite")
      }
    },
    actor: { id: "actor_store", kind: "human", label: "Store test" },
    now: () => "2026-07-15T21:00:00.000Z"
  });
}

function promptEnvelope() {
  return buildPromptArtifact({
    promptTemplateId: "resident-agent-local-runtime-status.v1",
    promptTemplateVersion: 1,
    generatedAt: "2026-07-15T21:00:00.000Z",
    runType: "evidence-triage",
    safetyClass: "workspace-safe",
    transferApprovalClass: "none",
    contextPackRefs: [buildContextPackRef({
      contextPackId: "workspace-runtime-status.v1",
      version: 1,
      generatedAt: "2026-07-15T21:00:00.000Z",
      payload: { status: "ready" },
      safeSummary: "Mounted store fixture context.",
      provenanceRefs: ["evt_prompt_store_fixture"]
    })],
    text: "Canonical mounted store prompt.",
    safeSummary: "Canonical mounted store prompt."
  });
}

async function productionPromptEnvelope() {
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
        label: `Mounted store ${requirement.contextPackId}`,
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
        safeSummary: `Mounted store ${requirement.contextPackId} context.`,
        provenanceRefs: ["evt_mounted_store_fixture"]
      })
    });
  }
  const resolvedContextPacks = await Promise.all(registration.contextRequirements
    .filter((requirement) => requirement.requirementMode === "always")
    .map(async (requirement) => await registry.buildResolved(requirement.contextPackId)));
  return renderProductionSpecialistPrompt({
    taskId: "task_mounted_store_test",
    runId: "run_mounted_store_test",
    runType: "evidence-triage",
    generatedAt: "2026-07-15T21:00:00.000Z",
    scope: { kind: "workspace", refs: ["ws_prompt_store_test"] },
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
      return { history: { projectionHighWaterMark: 1, projectionSourceRef: "agent.test", tasks: [{ taskId: "task_mounted_store_test", status: "queued", statusReasonCode: "Awaiting review." }], runs: [], modelInvocations: [], toolRequests: [], aggregateCounts: { tasks: 1 }, sourceEventIds: ["evt_task_001"], artifactHashes: [] } };
    case "workspace-runtime-status.v1":
      return { runtime: { runtimeHighWaterMark: 1, workspaceMounted: true, storageStrategy: "portable-workspace", bindPosture: "bound", authPosture: "none", projectionHighWaterMarks: { agent: 1 }, omissionCodes: [] } };
    default:
      throw new Error(`Unexpected mounted store context pack ${contextPackId}`);
  }
}

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}
