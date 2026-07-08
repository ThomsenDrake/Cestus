import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createAgentRuntime,
  type ModelInvocationRequest,
  type ModelInvocationResult,
  type ModelProviderAdapter,
  type ProviderDescriptor
} from "../../agent/src/index.js";
import { runAgentNousSmokeCli } from "../src/agent-nous-smoke.js";
import type { LocalAgentRuntimeFactory } from "../src/agent-runtime-factory.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("agent Nous smoke command", () => {
  it("prints stable safe JSON after runtime, prompt artifact, provider, and audit invocation", async () => {
    const provider = new FakeNousProvider();
    const lines: string[] = [];

    const exitCode = await runAgentNousSmokeCli([], {
      cwd: () => tempDir("cestus-nous-smoke-cwd-"),
      tempDir: () => tempDir("cestus-nous-smoke-runtime-"),
      now: () => "2026-07-08T12:20:00.000Z",
      env: {},
      loadAgentEnv: () => ({ nousApiKey: "local-material" }),
      agentRuntimeFactory: fakeRuntimeFactory(provider),
      stdout: (line) => lines.push(line)
    });

    expect(exitCode).toBe(0);
    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0]?.inputText).toContain("workspace runtime status");

    const printed = lines.join("");
    const output = JSON.parse(printed) as Record<string, unknown>;
    expect(Object.keys(output).sort()).toEqual([
      "contextPackIds",
      "inputArtifactHash",
      "invocationEventIds",
      "ok",
      "omissionCount",
      "outputArtifactHash"
    ]);
    expect(output).toMatchObject({
      ok: true,
      inputArtifactHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      outputArtifactHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      contextPackIds: ["workspace-runtime-status.v1"],
      omissionCount: expect.any(Number)
    });
    expect(output.invocationEventIds).toEqual([
      expect.stringMatching(/^evt_/),
      expect.stringMatching(/^evt_/)
    ]);
    expect(printed).not.toContain("workspace runtime status");
    expect(printed).not.toContain(fakeOutputText());
    expect(printed).not.toContain("local-material");
    expect(printed).not.toMatch(unsafeTextPattern());
    expect(printed).not.toMatch(localSettingNamePattern());
  });

  it("exits nonzero with a generic safe diagnostic when provider settings are unavailable", async () => {
    const lines: string[] = [];
    const exitCode = await runAgentNousSmokeCli([], {
      cwd: () => tempDir("cestus-nous-smoke-missing-cwd-"),
      tempDir: () => tempDir("cestus-nous-smoke-missing-runtime-"),
      now: () => "2026-07-08T12:20:00.000Z",
      env: {},
      loadAgentEnv: () => ({}),
      stdout: (line) => lines.push(line)
    });

    expect(exitCode).not.toBe(0);
    const printed = lines.join("");
    expect(JSON.parse(printed)).toEqual({
      ok: false,
      status: "blocked",
      diagnostic: {
        code: "provider-settings-unavailable",
        message: "Nous provider settings are unavailable.",
        allowedRepairActions: ["configure local provider settings"]
      }
    });
    expect(printed).not.toMatch(localSettingNamePattern());
    expect(printed).not.toMatch(unsafeTextPattern());
  });

  it("prints only generic safe diagnostics when provider invocation fails", async () => {
    const lines: string[] = [];
    const exitCode = await runAgentNousSmokeCli([], {
      cwd: () => tempDir("cestus-nous-smoke-fail-cwd-"),
      tempDir: () => tempDir("cestus-nous-smoke-fail-runtime-"),
      now: () => "2026-07-08T12:20:00.000Z",
      env: {},
      loadAgentEnv: () => ({ nousApiKey: "local-material" }),
      agentRuntimeFactory: fakeRuntimeFactory(new ThrowingNousProvider()),
      stdout: (line) => lines.push(line)
    });

    const printed = lines.join("");
    expect(exitCode).not.toBe(0);
    expect(JSON.parse(printed)).toMatchObject({
      ok: false,
      status: "blocked",
      diagnostic: {
        code: "provider-invocation-failed",
        message: "Nous smoke did not complete."
      }
    });
    expect(printed).not.toContain("local-material");
    expect(printed).not.toContain(unsafeProviderErrorText());
    expect(printed).not.toMatch(unsafeTextPattern());
  });
});

function fakeRuntimeFactory(provider: ModelProviderAdapter): LocalAgentRuntimeFactory {
  return ({ handle, actor, now }) => createAgentRuntime({
    ledger: handle.ledger,
    actor,
    now,
    providers: [provider]
  });
}

class FakeNousProvider implements ModelProviderAdapter {
  readonly calls: ModelInvocationRequest[] = [];

  describe(): ProviderDescriptor {
    return nousDescriptor();
  }

  async invoke(request: ModelInvocationRequest): Promise<ModelInvocationResult> {
    this.calls.push(request);
    return {
      outputText: fakeOutputText(),
      outputArtifactHash: hashOutput(request.inputArtifactHash, fakeOutputText()),
      usage: { inputUnits: 31, outputUnits: 7 }
    };
  }
}

class ThrowingNousProvider extends FakeNousProvider {
  override async invoke(_request: ModelInvocationRequest): Promise<ModelInvocationResult> {
    throw new Error(unsafeProviderErrorText());
  }
}

function nousDescriptor(): ProviderDescriptor {
  return {
    providerId: "provider_nous_portal",
    label: "Nous Portal",
    adapterVersion: "openai-compatible-chat.v1",
    endpointKind: "openai-compatible-api",
    modelFamilies: ["nous-smoke-model"],
    credentialKinds: ["api-key-bearer"],
    supportsStructuredOutput: false,
    supportsToolCalling: false,
    safeDataNotes: "Remote model provider used only with approved prompt artifacts."
  };
}

function hashOutput(inputArtifactHash: string, outputText: string): `sha256:${string}` {
  const digest = createHash("sha256")
    .update(inputArtifactHash)
    .update("\0")
    .update(outputText)
    .digest("hex");
  return `sha256:${digest}`;
}

function fakeOutputText(): string {
  return ["model", "completion", "hidden"].join(" ");
}

function unsafeProviderErrorText(): string {
  return ["Author", "ization", ": Bear", "er ", ["raw", "provider", "material"].join("-")].join("");
}

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function unsafeTextPattern(): RegExp {
  return new RegExp(["pass", "word|private ", "key|author", "ization|bear", "er"].join(""), "i");
}

function localSettingNamePattern(): RegExp {
  return new RegExp(["CESTUS", "_AGENT", "_NOUS"].join(""), "i");
}
