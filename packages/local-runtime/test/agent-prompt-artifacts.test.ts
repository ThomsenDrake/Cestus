import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createPortableWorkspace } from "../../workspace/src/index.js";
import { resolveLocalRuntimeConfig, type ResolvedLocalRuntimeConfig } from "../src/config.js";
import { createSqlitePrrRuntime } from "../src/runtime-factory.js";
import {
  buildLocalRuntimeStatusPromptArtifact,
  createLocalRuntimePromptArtifactResolver
} from "../src/agent-prompt-artifacts.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("local runtime prompt artifacts", () => {
  it("builds a context-pack-backed prompt artifact without placeholder hash text", async () => {
    const handle = createTestHandle();
    try {
      const envelope = buildLocalRuntimeStatusPromptArtifact({
        handle,
        now: () => "2026-07-08T12:10:00.000Z"
      });

      expect(envelope.manifest.inputArtifactHash).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(envelope.manifest.contextPackRefs.map((ref) => ref.contextPackId)).toEqual(["workspace-runtime-status.v1"]);
      expect(envelope.manifest.safetyClass).toBe("provider-approved");
      expect(envelope.manifest.transferApprovalClass).toBe("provider-byte-transfer");
      expect(envelope.manifest.promptTemplateId).toBe("resident-agent-local-runtime-status.v1");
      expect(envelope.manifest.omissions.length).toBeGreaterThan(0);
      expect(envelope.text).toContain("workspace runtime status");
      expect(envelope.text).not.toContain("Cestus local runtime prompt artifact");
      expect(envelope.text).not.toContain(envelope.manifest.inputArtifactHash);
      expect(JSON.stringify(envelope)).not.toMatch(unsafeTextPattern());
    } finally {
      handle.close();
    }
  });

  it("resolves only known local prompt artifacts", async () => {
    const handle = createTestHandle();
    try {
      const envelope = buildLocalRuntimeStatusPromptArtifact({
        handle,
        now: () => "2026-07-08T12:10:00.000Z"
      });
      const resolver = createLocalRuntimePromptArtifactResolver([envelope]);

      await expect(resolver.resolve(envelope.manifest.inputArtifactHash)).resolves.toMatchObject({
        manifest: { inputArtifactHash: envelope.manifest.inputArtifactHash }
      });
      await expect(
        resolver.resolve("sha256:8888888888888888888888888888888888888888888888888888888888888888")
      ).rejects.toThrow(/not found/i);
    } finally {
      handle.close();
    }
  });

  it("keeps status prompt artifacts out of fallback storage and local paths", async () => {
    const workspaceRoot = tempDir("cestus-agent-prompt-workspace-");
    createPortableWorkspace({
      rootDir: workspaceRoot,
      workspaceId: "ws_prompt_artifacts_001",
      label: "Prompt Artifact Workspace",
      createdAt: "2026-07-08T12:00:00.000Z",
      createdBy: "actor_prompt_test"
    });
    const handle = createTestHandle({
      cwd: tempDir("cestus-agent-prompt-cwd-"),
      config: portableConfig(workspaceRoot)
    });

    try {
      const envelope = buildLocalRuntimeStatusPromptArtifact({
        handle,
        now: () => "2026-07-08T12:10:00.000Z",
        projectionHighWaterMark: 4
      });

      const blobRoot = handle.mountedWorkspace?.paths.blobRoot;
      expect(blobRoot).toBeDefined();
      expect(countStoredFiles(blobRoot ?? "")).toBe(0);
      expect(JSON.stringify(envelope.manifest)).not.toContain(workspaceRoot);
      expect(envelope.manifest.contextPackRefs[0]).toMatchObject({
        projectionHighWaterMark: 4,
        scope: { kind: "workspace", id: "ws_prompt_artifacts_001" }
      });
    } finally {
      handle.close();
    }
  });
});

function createTestHandle(input: {
  readonly cwd?: string;
  readonly config?: ResolvedLocalRuntimeConfig;
} = {}) {
  const cwd = input.cwd ?? tempDir("cestus-agent-prompt-");
  return createSqlitePrrRuntime({
    config: input.config ?? resolveLocalRuntimeConfig({ cwd, env: {} }),
    actor: { id: "actor_prompt_test", kind: "human", label: "Prompt Test" },
    now: () => "2026-07-08T12:10:00.000Z"
  });
}

function portableConfig(workspaceRoot: string): ResolvedLocalRuntimeConfig {
  const cwd = tempDir("cestus-agent-prompt-portable-cwd-");
  return {
    cwd,
    storage: {
      strategy: "portable-workspace",
      workspaceRoot,
      expectedWorkspaceId: "ws_prompt_artifacts_001",
      sqlitePath: join(workspaceRoot, "ledger", "ontology.sqlite")
    },
    http: {
      host: "127.0.0.1",
      port: 8787,
      bindMode: "loopback",
      authRequired: false,
      devSeedEnabled: false
    },
    staticUi: { distDir: join(cwd, "dist") },
    logs: { dir: join(cwd, ".cestus", "local", "logs") }
  };
}

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function countStoredFiles(root: string): number {
  if (!existsSync(root)) {
    return 0;
  }
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile()).length;
}

function unsafeTextPattern(): RegExp {
  return new RegExp(["pass", "word|private ", "key|author", "ization|bear", "er"].join(""), "i");
}
