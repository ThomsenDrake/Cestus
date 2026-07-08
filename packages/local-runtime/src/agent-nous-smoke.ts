import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { AgentRuntimeDiagnosticDto } from "../../agent/src/index.js";
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
  const now = dependencies.now ?? (() => new Date().toISOString());
  const cwd = dependencies.cwd?.() ?? process.cwd();

  if (argv.length > 0) {
    stdout(`${JSON.stringify(blockedReport(
      "invalid-arguments",
      "Nous smoke accepts no command arguments.",
      ["run the smoke command without arguments"]
    ))}\n`);
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
  stdout(`${JSON.stringify(report)}\n`);
  return report.ok ? 0 : 3;
}

export async function runAgentNousSmoke(
  input: RunAgentNousSmokeInput = {},
  dependencies: RunAgentNousSmokeDependencies = {}
): Promise<AgentNousSmokeReport> {
  const cwd = input.cwd ?? dependencies.cwd?.() ?? process.cwd();
  const now = input.now ?? dependencies.now ?? (() => new Date().toISOString());
  const loadEnv = dependencies.loadAgentEnv ?? loadLocalAgentEnv;
  const localEnv = loadEnv({
    cwd,
    ...(input.env === undefined ? {} : { env: input.env })
  });

  if (localEnv.nousApiKey === undefined) {
    return blockedReport(
      "provider-settings-unavailable",
      "Nous provider settings are unavailable.",
      ["configure local provider settings"]
    );
  }

  const tempRoot = dependencies.tempDir?.() ?? mkdtempSync(join(tmpdir(), "cestus-nous-smoke-"));
  const shouldCleanupTempRoot = dependencies.tempDir === undefined;
  const handle = createSqlitePrrRuntime({
    config: resolveLocalRuntimeConfig({
      cwd,
      env: {
        ...(input.env ?? process.env),
        CESTUS_LOCAL_STORAGE: "explicit-path",
        CESTUS_LOCAL_SQLITE_PATH: join(tempRoot, "runtime.sqlite")
      }
    }),
    actor: smokeActor,
    now
  });

  try {
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
      return runtimeBlockedReport("runtime-initialization-failed", identity.error);
    }
    const task = await runtime.createTask({
      taskId: smokeTaskId,
      title: "Inspect local runtime status",
      requestedBy: smokeActor.id,
      priority: "normal"
    });
    if (!task.ok) {
      return runtimeBlockedReport("runtime-task-failed", task.error);
    }
    const run = await runtime.startRun({
      runId: smokeRunId,
      taskId: smokeTaskId,
      runType: "evidence-triage",
      scope: { kind: "workspace", refs: [workspaceId] }
    });
    if (!run.ok) {
      return runtimeBlockedReport("runtime-run-failed", run.error);
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
      return runtimeBlockedReport("provider-invocation-failed", invoked.error);
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
    return blockedReport(
      "provider-invocation-failed",
      "Nous smoke did not complete.",
      ["inspect local provider setup before retrying"]
    );
  } finally {
    handle.close();
    if (shouldCleanupTempRoot) {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  }
}

function runtimeBlockedReport(code: string, diagnostic: AgentRuntimeDiagnosticDto): AgentNousSmokeBlockedReport {
  if (code === "provider-invocation-failed") {
    return blockedReport(
      code,
      "Nous smoke did not complete.",
      ["inspect local provider setup before retrying"]
    );
  }

  return blockedReport(code, diagnostic.message, diagnostic.allowedRepairActions ?? ["inspect local runtime status"]);
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

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const exitCode = await runAgentNousSmokeCli();
  process.exitCode = exitCode;
}
