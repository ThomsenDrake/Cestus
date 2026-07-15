import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildContextPackRef } from "../../agent/src/context-packs.js";
import { buildPromptArtifact } from "../../agent/src/prompt-artifacts.js";
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

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}
