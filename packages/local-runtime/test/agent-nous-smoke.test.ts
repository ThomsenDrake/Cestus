import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isAgentSecretSafeText, type PromptArtifactEnvelope } from "../../agent/src/index.js";
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
    const runtime = new SuccessfulSmokeRuntime();
    const lines: string[] = [];

    const exitCode = await runAgentNousSmokeCli([], {
      cwd: () => tempDir("cestus-nous-smoke-cwd-"),
      tempDir: () => tempDir("cestus-nous-smoke-runtime-"),
      now: () => "2026-07-08T12:20:00.000Z",
      env: {},
      providerSettingsAvailable: () => true,
      agentRuntimeFactory: runtime.factory(),
      stdout: (line) => lines.push(line)
    });

    expect(exitCode).toBe(0);
    expect(runtime.promptArtifacts).toHaveLength(1);
    expect(runtime.promptArtifacts[0]?.text).toContain("workspace runtime status");

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
    expect(printed).not.toContain(modelOutputSentinel());
    expect(printed).not.toContain(providerSetupSentinel());
    expect(isAgentSecretSafeText(printed)).toBe(true);
  });

  it("exits nonzero with a generic safe diagnostic when provider settings are unavailable", async () => {
    const lines: string[] = [];
    const exitCode = await runAgentNousSmokeCli([], {
      cwd: () => tempDir("cestus-nous-smoke-missing-cwd-"),
      tempDir: () => tempDir("cestus-nous-smoke-missing-runtime-"),
      now: () => "2026-07-08T12:20:00.000Z",
      env: {},
      providerSettingsAvailable: () => false,
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
    expect(isAgentSecretSafeText(printed)).toBe(true);
  });

  it("prints only generic safe diagnostics when runtime invocation fails", async () => {
    const lines: string[] = [];
    const exitCode = await runAgentNousSmokeCli([], {
      cwd: () => tempDir("cestus-nous-smoke-fail-cwd-"),
      tempDir: () => tempDir("cestus-nous-smoke-fail-runtime-"),
      now: () => "2026-07-08T12:20:00.000Z",
      env: {},
      providerSettingsAvailable: () => true,
      agentRuntimeFactory: new FailingSmokeRuntime().factory(),
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
    expect(printed).not.toContain(providerSetupSentinel());
    expect(printed).not.toContain(unsafeDiagnosticSentinel());
    expect(isAgentSecretSafeText(printed)).toBe(true);
  });

  it("prints safe JSON when setup fails before runtime creation", async () => {
    const lines: string[] = [];
    const exitCode = await runAgentNousSmokeCli([], {
      cwd: () => {
        throw new Error(unsafeDiagnosticSentinel());
      },
      stdout: (line) => lines.push(line)
    });

    const printed = lines.join("");
    expect(exitCode).not.toBe(0);
    expect(JSON.parse(printed)).toMatchObject({
      ok: false,
      status: "blocked",
      diagnostic: {
        code: "smoke-failed",
        message: "Nous smoke did not complete."
      }
    });
    expect(printed).not.toContain(unsafeDiagnosticSentinel());
    expect(isAgentSecretSafeText(printed)).toBe(true);
  });

});

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

class SuccessfulSmokeRuntime {
  readonly promptArtifacts: PromptArtifactEnvelope[] = [];

  factory(): LocalAgentRuntimeFactory {
    return (() => ({
      status: async () => smokeStatus(),
      initializeDefaultIdentity: async () => ({ ok: true, residentAgentId: "agent_default", alreadyInitialized: false, eventIds: ["evt_identity_smoke"] }),
      createTask: async () => ({ ok: true, taskId: "task_agent_nous_smoke", eventIds: ["evt_task_smoke"] }),
      startRun: async () => ({ ok: true, runId: "run_agent_nous_smoke", eventIds: ["evt_run_smoke"] }),
      invokeModel: async (command: { readonly promptArtifact?: PromptArtifactEnvelope }) => {
        if (command.promptArtifact !== undefined) {
          this.promptArtifacts.push(command.promptArtifact);
        }
        return {
          ok: true,
          invocationId: "inv_agent_nous_smoke",
          outputArtifactHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          eventIds: ["evt_invocation_requested_smoke", "evt_invocation_completed_smoke"],
          usage: { inputUnits: 31, outputUnits: 7 }
        };
      },
      gateway: {}
    })) as unknown as LocalAgentRuntimeFactory;
  }
}

class FailingSmokeRuntime {
  factory(): LocalAgentRuntimeFactory {
    return (() => ({
      status: async () => smokeStatus(),
      initializeDefaultIdentity: async () => ({ ok: true, residentAgentId: "agent_default", alreadyInitialized: false, eventIds: ["evt_identity_smoke"] }),
      createTask: async () => ({ ok: true, taskId: "task_agent_nous_smoke", eventIds: [] }),
      startRun: async () => ({ ok: true, runId: "run_agent_nous_smoke", eventIds: [] }),
      invokeModel: async () => ({
        ok: false,
        error: {
          severity: "error",
          category: "provider",
          message: unsafeDiagnosticSentinel(),
          allowedRepairActions: [unsafeDiagnosticSentinel()]
        }
      }),
      gateway: {}
    })) as unknown as LocalAgentRuntimeFactory;
  }
}

function smokeStatus() {
  return {
    schemaVersion: "agent-status.v1",
    generatedAt: "2026-07-08T12:20:00.000Z",
    identity: undefined,
    tasks: [],
    runs: [],
    toolRequests: [],
    permissions: [],
    locks: [],
    memories: [],
    modelInvocations: [],
    providerReadiness: undefined,
    providers: [{
      providerId: "provider_nous_portal",
      label: "Nous Portal",
      adapterVersion: "openai-compatible-chat.v1",
      endpointKind: "openai-compatible-api",
      modelFamilies: ["nous-smoke-model"],
      credentialKinds: [],
      supportsStructuredOutput: false,
      supportsToolCalling: false,
      safeDataNotes: "Remote model provider used only with approved prompt artifacts."
    }],
    pendingApprovalCount: 0,
    activeLockCount: 0,
    diagnostics: []
  };
}

function modelOutputSentinel(): string {
  return "model-output-sentinel";
}

function providerSetupSentinel(): string {
  return "provider-setup-sentinel";
}

function unsafeDiagnosticSentinel(): string {
  return "unsafe-diagnostic-sentinel";
}
