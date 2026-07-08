import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { resolveLocalRuntimeConfig } from "./config.js";
import { loadLocalAgentEnv, type LocalAgentEnv } from "./agent-env.js";
import { defaultLocalAgentRuntimeFactory, type LocalAgentRuntimeFactory } from "./agent-runtime-factory.js";
import { buildLocalRuntimeStatusPromptArtifact } from "./agent-prompt-artifacts.js";
import { createSqlitePrrRuntime } from "./runtime-factory.js";

export interface AgentNousSmokeSuccessReport {
  readonly ok: true;
  readonly inputArtifactHash: string;
  readonly outputArtifactHash: string;
  readonly invocationEventIds: readonly string[];
  readonly contextPackIds: readonly string[];
  readonly omissionCount: number;
}

export interface AgentNousSmokeBlockedReport {
  readonly ok: false;
  readonly status: "blocked";
  readonly diagnostic: {
    readonly code: string;
    readonly message: string;
    readonly allowedRepairActions: readonly string[];
  };
}

export type AgentNousSmokeReport = AgentNousSmokeSuccessReport | AgentNousSmokeBlockedReport;

export interface RunAgentNousSmokeInput {
  readonly cwd?: string;
  readonly env?: Record<string, string | undefined>;
  readonly now?: () => string;
}

export interface RunAgentNousSmokeDependencies {
  readonly cwd?: () => string;
  readonly tempDir?: () => string;
  readonly now?: () => string;
  readonly stdout?: (line: string) => void;
  readonly env?: Record<string, string | undefined>;
  readonly loadAgentEnv?: (input: { readonly cwd: string; readonly env?: Record<string, string | undefined> }) => LocalAgentEnv;
  readonly providerSettingsAvailable?: (input: { readonly cwd: string; readonly env?: Record<string, string | undefined> }) => boolean;
  readonly agentRuntimeFactory?: LocalAgentRuntimeFactory;
}

const smokeActor = { id: "actor_agent_nous_smoke", kind: "human" as const, label: "Agent Nous Smoke" };
const smokeTaskId = "task_agent_nous_smoke";
const smokeRunId = "run_agent_nous_smoke";
const smokeInvocationId = "inv_agent_nous_smoke";

export async function runAgentNousSmokeCli(
  argv: readonly string[] = process.argv.slice(2),
  dependencies: RunAgentNousSmokeDependencies = {}
): Promise<number> {
  const stdout = dependencies.stdout ?? ((line: string) => process.stdout.write(line));
  try {
    const now = dependencies.now ?? (() => new Date().toISOString());
    const cwd = dependencies.cwd?.() ?? process.cwd();

    if (argv.length > 0) {
      writeSmokeReport(stdout, blockedReport(
        "invalid-arguments",
        "Nous smoke accepts no command arguments.",
        ["run the smoke command without arguments"]
      ));
      return 2;
    }

    const report = await runAgentNousSmoke(
      {
        cwd,
        now,
        ...(dependencies.env === undefined ? {} : { env: dependencies.env })
      },
      dependencies
    );
    writeSmokeReport(stdout, report);
    return report.ok ? 0 : 3;
  } catch {
    writeSmokeReport(stdout, genericSmokeFailureReport());
    return 3;
  }
}

export async function runAgentNousSmoke(
  input: RunAgentNousSmokeInput = {},
  dependencies: RunAgentNousSmokeDependencies = {}
): Promise<AgentNousSmokeReport> {
  let tempRoot: string | undefined;
  let shouldCleanupTempRoot = false;
  let handle: ReturnType<typeof createSqlitePrrRuntime> | undefined;

  try {
    const cwd = input.cwd ?? dependencies.cwd?.() ?? process.cwd();
    const now = input.now ?? dependencies.now ?? (() => new Date().toISOString());
    const env = input.env;

    const providerSettingsInput = env === undefined ? { cwd } : { cwd, env };
    if (!hasNousProviderSettings(providerSettingsInput, dependencies)) {
      return blockedReport(
        "provider-settings-unavailable",
        "Nous provider settings are unavailable.",
        ["configure local provider settings"]
      );
    }

    tempRoot = dependencies.tempDir?.() ?? mkdtempSync(join(tmpdir(), "cestus-nous-smoke-"));
    shouldCleanupTempRoot = dependencies.tempDir === undefined;
    handle = createSqlitePrrRuntime({
      config: resolveLocalRuntimeConfig({
        cwd,
        env: {
          ...(env ?? process.env),
          CESTUS_LOCAL_STORAGE: "explicit-path",
          CESTUS_LOCAL_SQLITE_PATH: join(tempRoot, "runtime.sqlite")
        }
      }),
      actor: smokeActor,
      now
    });

    const runtime = (dependencies.agentRuntimeFactory ?? defaultLocalAgentRuntimeFactory)({
      handle,
      actor: smokeActor,
      now
    });
    const status = await runtime.status();
    const nousProvider = status.providers.find((provider) => provider.providerId === "provider_nous_portal");
    const modelFamily = nousProvider?.modelFamilies[0];
    if (nousProvider === undefined || modelFamily === undefined) {
      return blockedReport(
        "provider-unavailable",
        "Nous provider is unavailable.",
        ["inspect local provider setup"]
      );
    }

    const workspaceId = handle.mountedWorkspace?.workspaceId ?? "ws_agent_nous_smoke";
    const identity = await runtime.initializeDefaultIdentity({ workspaceId });
    if (!identity.ok) {
      return runtimeBlockedReport("runtime-initialization-failed");
    }
    const task = await runtime.createTask({
      taskId: smokeTaskId,
      title: "Inspect local runtime status",
      requestedBy: smokeActor.id,
      priority: "normal"
    });
    if (!task.ok) {
      return runtimeBlockedReport("runtime-task-failed");
    }
    const run = await runtime.startRun({
      runId: smokeRunId,
      taskId: smokeTaskId,
      runType: "evidence-triage",
      scope: { kind: "workspace", refs: [workspaceId] }
    });
    if (!run.ok) {
      return runtimeBlockedReport("runtime-run-failed");
    }

    const events = await handle.ledger.readAll();
    const promptArtifact = buildLocalRuntimeStatusPromptArtifact({
      handle,
      now,
      providerDescriptors: status.providers,
      projectionHighWaterMark: events.length,
      sourceEventIds: events.map((event) => event.id)
    });
    const invoked = await runtime.invokeModel({
      invocationId: smokeInvocationId,
      runId: smokeRunId,
      providerId: nousProvider.providerId,
      modelFamily,
      inputArtifactHash: promptArtifact.manifest.inputArtifactHash,
      safetyClass: "provider-approved",
      credentialRef: {
        credentialRefId: "agent_credref_nous_portal",
        providerId: nousProvider.providerId,
        kind: "api-key-bearer",
        safeLabel: "Nous Portal local binding"
      },
      promptArtifact
    });

    if (!invoked.ok) {
      return runtimeBlockedReport("provider-invocation-failed");
    }

    return Object.freeze({
      ok: true,
      inputArtifactHash: promptArtifact.manifest.inputArtifactHash,
      outputArtifactHash: invoked.outputArtifactHash,
      invocationEventIds: Object.freeze([...invoked.eventIds]),
      contextPackIds: Object.freeze(promptArtifact.manifest.contextPackRefs.map((ref) => ref.contextPackId)),
      omissionCount: promptArtifact.manifest.omissions.length
    });
  } catch {
    return genericSmokeFailureReport();
  } finally {
    try {
      handle?.close();
    } catch {
      // Keep smoke cleanup failures inside the safe JSON boundary.
    }
    if (shouldCleanupTempRoot && tempRoot !== undefined) {
      try {
        rmSync(tempRoot, { recursive: true, force: true });
      } catch {
        // Cleanup failures must not escape the smoke JSON boundary.
      }
    }
  }
}

function hasNousProviderSettings(
  input: { readonly cwd: string; readonly env?: Record<string, string | undefined> },
  dependencies: RunAgentNousSmokeDependencies
): boolean {
  if (dependencies.providerSettingsAvailable !== undefined) {
    return dependencies.providerSettingsAvailable(input);
  }

  const loadEnv = dependencies.loadAgentEnv ?? loadLocalAgentEnv;
  const localEnv = loadEnv({
    cwd: input.cwd,
    ...(input.env === undefined ? {} : { env: input.env })
  });

  return localEnv.nousApiKey !== undefined;
}

function runtimeBlockedReport(code: string): AgentNousSmokeBlockedReport {
  return blockedReport(
    code,
    "Nous smoke did not complete.",
    ["inspect local provider setup before retrying"]
  );
}

function blockedReport(
  code: string,
  message: string,
  allowedRepairActions: readonly string[]
): AgentNousSmokeBlockedReport {
  return Object.freeze({
    ok: false,
    status: "blocked",
    diagnostic: Object.freeze({
      code,
      message,
      allowedRepairActions: Object.freeze([...allowedRepairActions])
    })
  });
}

function genericSmokeFailureReport(): AgentNousSmokeBlockedReport {
  return blockedReport(
    "smoke-failed",
    "Nous smoke did not complete.",
    ["inspect local provider setup before retrying"]
  );
}

function writeSmokeReport(stdout: (line: string) => void, report: AgentNousSmokeReport): void {
  try {
    stdout(`${JSON.stringify(report)}\n`);
  } catch {
    // A CLI stdout failure cannot be repaired here, but it must not print raw diagnostics.
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const exitCode = await runAgentNousSmokeCli();
  process.exitCode = exitCode;
}
