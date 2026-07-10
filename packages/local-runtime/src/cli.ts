import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  resolveLocalRuntimeConfig,
  type LocalRuntimeConfigInput,
  type ResolvedLocalRuntimeConfig
} from "./config.js";
import {
  readLocalRuntimeConfigFile,
  redactLocalRuntimeConfigFile,
  writeLocalRuntimeOnboardingConfig,
  type WriteLocalRuntimeOnboardingConfigInput
} from "./config-file.js";
import { createLocalRuntimeHttpHandler } from "./http-handler.js";
import { startLocalRuntimeServer } from "./server.js";
import { createPortableWorkspace, portableWorkspacePaths, readPortableWorkspaceManifest } from "../../workspace/src/index.js";
import { ensureDefaultResidentIdentity, type ResidentIdentityLifecycleDto } from "../../agent/src/identity-bootstrap.js";
import type { ActorRef } from "../../ontology/src/contracts.js";
import { SQLiteEventLedger } from "../../ontology/src/sqlite-event-ledger.js";
import { agentProviderSmokeResultSchema, runLiveNousProviderSmoke } from "./agent-provider-smoke.js";

export interface LocalRuntimeCliDependencies {
  readonly cwd?: string;
  readonly env?: Record<string, string | undefined>;
  readonly stdout?: (line: string) => void;
  readonly stderr?: (line: string) => void;
  readonly serve?: () => Promise<void>;
  readonly seedPrr?: () => Promise<unknown>;
  readonly agentStatus?: () => Promise<unknown>;
  readonly agentCreateTask?: (input: {
    readonly taskId: string;
    readonly title: string;
    readonly priority?: string;
  }) => Promise<unknown>;
  readonly residentIdentityBootstrapForTest?: (input: {
    readonly ledger: SQLiteEventLedger;
    readonly workspaceId: string;
    readonly actor: ActorRef;
    readonly now: () => string;
  }) => Promise<ResidentIdentityLifecycleDto>;
}

export async function runLocalRuntimeCli(
  argv: readonly string[],
  dependencies: LocalRuntimeCliDependencies = {}
): Promise<number> {
  const command = argv[0] ?? "serve";
  const stdout = dependencies.stdout ?? ((line: string) => console.log(line));
  const stderr = dependencies.stderr ?? ((line: string) => console.error(line));

  try {
    if (command === "configure") {
      const written = writeLocalRuntimeOnboardingConfig({
        ...configInputFrom(dependencies),
        ...resolveConfigureFlags(parseConfigureArgs(argv.slice(1)), dependencies)
      });
      stdout(
        JSON.stringify(
          {
            ok: true,
            configPath: written.path,
            config: redactLocalRuntimeConfigFile(written.config)
          },
          null,
          2
        )
      );
      return 0;
    }

    if (command === "create-workspace") {
      const createWorkspaceInput = parseCreateWorkspaceArgs(argv.slice(1));
      const workspace = createPortableWorkspace({
        ...createWorkspaceInput,
        rootDir: resolve(dependencies.cwd ?? process.cwd(), createWorkspaceInput.rootDir)
      });
      const ledger = new SQLiteEventLedger(workspace.paths.ledgerPath);
      try {
        const lifecycle = await (dependencies.residentIdentityBootstrapForTest ?? ensureDefaultResidentIdentity)({
          ledger,
          workspaceId: workspace.workspaceId,
          actor: { id: "actor_local_workspace_bootstrap", kind: "system", label: "Local Workspace Bootstrap" },
          now: () => new Date().toISOString()
        });
        if (lifecycle.state !== "ready") {
          throw new Error("Resident identity bootstrap failed.");
        }
      } finally {
        ledger.close();
      }
      stdout(
        JSON.stringify(
          {
            ok: true,
            workspace
          },
          null,
          2
        )
      );
      return 0;
    }

    if (command === "config") {
      stdout(JSON.stringify(redactedConfig(dependencies), null, 2));
      return 0;
    }

    if (command === "seed-prr") {
      const result =
        dependencies.seedPrr === undefined ? await seedLocalPrr(dependencies) : await dependencies.seedPrr();
      stdout(JSON.stringify(result, null, 2));
      return 0;
    }

    if (command === "agent-status") {
      const result =
        dependencies.agentStatus === undefined
          ? await requestLocalAgent(dependencies, { method: "GET", url: "/api/agent/status" })
          : await dependencies.agentStatus();
      stdout(agentCliJson(result));
      return 0;
    }

    if (command === "agent-create-task") {
      const taskInput = parseAgentCreateTaskArgs(argv.slice(1));
      const result =
        dependencies.agentCreateTask === undefined
          ? await requestLocalAgent(dependencies, {
              method: "POST",
              url: "/api/agent/tasks",
              body: JSON.stringify(taskInput)
            })
          : await dependencies.agentCreateTask(taskInput);
      stdout(agentCliJson(result));
      return 0;
    }

    if (command === "agent-provider-smoke") {
      parseAgentProviderSmokeArgs(argv.slice(1));
      const result = agentProviderSmokeResultSchema.parse(await runLiveNousProviderSmoke({
        ...(dependencies.cwd === undefined ? { cwd: process.cwd() } : { cwd: dependencies.cwd }),
        ...(dependencies.env === undefined ? {} : { env: dependencies.env })
      }));
      stdout(JSON.stringify(result, null, 2));
      return result.ok ? 0 : 1;
    }

    if (command === "health") {
      const config = resolveLocalRuntimeConfig(configInputFrom(dependencies));
      stdout(
        JSON.stringify(
          {
            ok: true,
            host: config.http.host,
            port: config.http.port,
            bindMode: config.http.bindMode,
            authRequired: config.http.authRequired
          },
          null,
          2
        )
      );
      return 0;
    }

    if (command === "serve") {
      if (dependencies.serve !== undefined) {
        await dependencies.serve();
        return 0;
      }

      const started = await startLocalRuntimeServer({
        ...(dependencies.cwd === undefined ? {} : { cwd: dependencies.cwd }),
        ...(dependencies.env === undefined ? {} : { env: dependencies.env })
      });
      stdout(
        `Cestus local runtime listening on http://${started.config.http.host}:${started.config.http.port}`
      );
      for (const sessionUrl of started.sessionBootstrapUrls ?? []) {
        stdout(`Cestus browser session URL: ${sessionUrl}`);
      }
      return 0;
    }

    stderr("Unknown local runtime command.");
    return 1;
  } catch (error) {
    stderr(redactDiagnosticText(error instanceof Error ? error.message : String(error)));
    return 1;
  }
}

async function seedLocalPrr(dependencies: LocalRuntimeCliDependencies): Promise<unknown> {
  const config = resolveLocalRuntimeConfig({
    ...(dependencies.cwd === undefined ? {} : { cwd: dependencies.cwd }),
    env: {
      ...(dependencies.env ?? process.env),
      CESTUS_DEV_SEED_PRR: "true"
    }
  });
  const handler = createLocalRuntimeHttpHandler({
    config,
    actor: { id: "actor_local_seed", kind: "system", label: "Local Seed CLI" }
  });

  try {
    const response = await handler({
      method: "POST",
      url: "/api/dev/seed-prr",
      ...(config.http.authToken === undefined
        ? {}
        : { headers: { authorization: `Bearer ${config.http.authToken}` } })
    });
    return JSON.parse(response.body) as unknown;
  } finally {
    handler.close();
  }
}

async function requestLocalAgent(
  dependencies: LocalRuntimeCliDependencies,
  request: { readonly method: string; readonly url: string; readonly body?: string }
): Promise<unknown> {
  const config = resolveLocalRuntimeConfig(configInputFrom(dependencies));
  const handler = createLocalRuntimeHttpHandler({
    config,
    actor: { id: "actor_local_agent_cli", kind: "human", label: "Local Agent CLI" }
  });

  try {
    const response = await handler({
      ...request,
      ...(config.http.authToken === undefined
        ? {}
        : { headers: { authorization: `Bearer ${config.http.authToken}` } })
    });
    const body = JSON.parse(response.body) as unknown;
    if (response.status >= 400) {
      throw new Error(messageFromLocalRuntimeBody(body));
    }
    return body;
  } finally {
    handler.close();
  }
}

function messageFromLocalRuntimeBody(body: unknown): string {
  if (typeof body !== "object" || body === null) {
    return "Local agent runtime request failed.";
  }

  const diagnostic = (body as { readonly diagnostic?: unknown }).diagnostic;
  if (typeof diagnostic === "object" && diagnostic !== null) {
    const message = (diagnostic as { readonly message?: unknown }).message;
    if (typeof message === "string" && message.trim().length > 0) {
      return message;
    }
  }

  return "Local agent runtime request failed.";
}

function redactedConfig(dependencies: LocalRuntimeCliDependencies): RedactedLocalRuntimeConfig {
  const config = resolveLocalRuntimeConfig(configInputFrom(dependencies));
  const { authToken: _authToken, ...http } = config.http;

  return {
    ...config,
    http:
      config.http.authToken === undefined
        ? http
        : {
            ...http,
            authToken: "[redacted]"
          }
  };
}

function configInputFrom(dependencies: LocalRuntimeCliDependencies): LocalRuntimeConfigInput {
  return {
    ...(dependencies.cwd === undefined ? {} : { cwd: dependencies.cwd }),
    ...(dependencies.env === undefined ? {} : { env: dependencies.env })
  };
}

type ConfigureFlags = Omit<WriteLocalRuntimeOnboardingConfigInput, "cwd" | "env">;

function parseConfigureArgs(argv: readonly string[]): ConfigureFlags {
  const options: {
    bindMode: ConfigureFlags["bindMode"];
    host?: string;
    port?: number;
    storageStrategy?: ConfigureFlags["storageStrategy"];
    sqlitePath?: string;
    appDataDir?: string;
    workspaceRoot?: string;
    expectedWorkspaceId?: string;
    distDir?: string;
    logDir?: string;
    devSeedEnabled?: boolean;
    rotateAuthToken?: boolean;
  } = {
    bindMode: "loopback"
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) {
      continue;
    }
    if (arg === "--dev-seed") {
      options.devSeedEnabled = true;
      continue;
    }
    if (arg === "--no-dev-seed") {
      options.devSeedEnabled = false;
      continue;
    }
    if (arg === "--rotate-auth-token") {
      options.rotateAuthToken = true;
      continue;
    }

    if (arg === "--bind") {
      const { value, nextIndex } = readFlagValue(argv, index, arg);
      options.bindMode = parseConfigureBindMode(value);
      index = nextIndex;
      continue;
    }
    if (arg === "--host") {
      const { value, nextIndex } = readFlagValue(argv, index, arg);
      options.host = value;
      index = nextIndex;
      continue;
    }
    if (arg === "--port") {
      const { value, nextIndex } = readFlagValue(argv, index, arg);
      options.port = parseConfigurePort(value);
      index = nextIndex;
      continue;
    }
    if (arg === "--storage") {
      const { value, nextIndex } = readFlagValue(argv, index, arg);
      options.storageStrategy = parseConfigureStorageStrategy(value);
      index = nextIndex;
      continue;
    }
    if (arg === "--sqlite-path") {
      const { value, nextIndex } = readFlagValue(argv, index, arg);
      options.sqlitePath = value;
      index = nextIndex;
      continue;
    }
    if (arg === "--app-data-dir") {
      const { value, nextIndex } = readFlagValue(argv, index, arg);
      options.appDataDir = value;
      index = nextIndex;
      continue;
    }
    if (arg === "--workspace") {
      const { value, nextIndex } = readFlagValue(argv, index, arg);
      options.workspaceRoot = value;
      index = nextIndex;
      continue;
    }
    if (arg === "--workspace-id") {
      const { value, nextIndex } = readFlagValue(argv, index, arg);
      options.expectedWorkspaceId = value;
      index = nextIndex;
      continue;
    }
    if (arg === "--ui-dist-dir") {
      const { value, nextIndex } = readFlagValue(argv, index, arg);
      options.distDir = value;
      index = nextIndex;
      continue;
    }
    if (arg === "--log-dir") {
      const { value, nextIndex } = readFlagValue(argv, index, arg);
      options.logDir = value;
      index = nextIndex;
      continue;
    }

    throw new Error(
      arg.startsWith("--") ? `Unknown configure flag: ${arg}` : `Unexpected configure argument: ${arg}`
    );
  }

  return {
    bindMode: options.bindMode,
    ...(options.host === undefined ? {} : { host: options.host }),
    ...(options.port === undefined ? {} : { port: options.port }),
    ...(options.storageStrategy === undefined ? {} : { storageStrategy: options.storageStrategy }),
    ...(options.sqlitePath === undefined ? {} : { sqlitePath: options.sqlitePath }),
    ...(options.appDataDir === undefined ? {} : { appDataDir: options.appDataDir }),
    ...(options.workspaceRoot === undefined ? {} : { workspaceRoot: options.workspaceRoot }),
    ...(options.expectedWorkspaceId === undefined ? {} : { expectedWorkspaceId: options.expectedWorkspaceId }),
    ...(options.distDir === undefined ? {} : { distDir: options.distDir }),
    ...(options.logDir === undefined ? {} : { logDir: options.logDir }),
    ...(options.devSeedEnabled === undefined ? {} : { devSeedEnabled: options.devSeedEnabled }),
    ...(options.rotateAuthToken === undefined ? {} : { rotateAuthToken: options.rotateAuthToken })
  };
}

function resolveConfigureFlags(
  flags: ConfigureFlags,
  dependencies: LocalRuntimeCliDependencies
): ConfigureFlags {
  if (flags.expectedWorkspaceId !== undefined) {
    return flags;
  }

  const existing = readLocalRuntimeConfigFile(configInputFrom(dependencies));
  const effectiveStorageStrategy = flags.storageStrategy ?? existing?.storage?.strategy;
  if (effectiveStorageStrategy !== "portable-workspace") {
    return flags;
  }

  const effectiveWorkspaceRoot = flags.workspaceRoot ?? existing?.storage?.workspaceRoot;
  if (effectiveWorkspaceRoot === undefined) {
    return flags;
  }

  if (
    existing?.storage?.strategy === "portable-workspace" &&
    existing.storage.expectedWorkspaceId !== undefined &&
    workspaceRootsMatch(effectiveWorkspaceRoot, existing.storage.workspaceRoot, dependencies)
  ) {
    return {
      ...flags,
      expectedWorkspaceId: existing.storage.expectedWorkspaceId
    };
  }

  const rootDir = resolve(dependencies.cwd ?? process.cwd(), effectiveWorkspaceRoot);
  try {
    const manifest = readPortableWorkspaceManifest({
      manifestPath: portableWorkspacePaths(rootDir).manifestPath
    });
    return {
      ...flags,
      expectedWorkspaceId: manifest.workspaceId
    };
  } catch {
    throw new Error(
      "portable-workspace configure requires --workspace-id or a readable workspace manifest"
    );
  }
}

function workspaceRootsMatch(
  effectiveWorkspaceRoot: string,
  existingWorkspaceRoot: string | undefined,
  dependencies: LocalRuntimeCliDependencies
): boolean {
  if (existingWorkspaceRoot === undefined) {
    return false;
  }
  const cwd = dependencies.cwd ?? process.cwd();
  return resolve(cwd, effectiveWorkspaceRoot) === resolve(cwd, existingWorkspaceRoot);
}

function parseCreateWorkspaceArgs(argv: readonly string[]) {
  const options: {
    rootDir?: string;
    workspaceId?: string;
    label?: string;
    createdAt?: string;
    createdBy?: string;
    coreVersion?: string;
    description?: string;
  } = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) {
      continue;
    }
    if (arg === "--workspace") {
      const { value, nextIndex } = readFlagValue(argv, index, arg);
      options.rootDir = value;
      index = nextIndex;
      continue;
    }
    if (arg === "--workspace-id") {
      const { value, nextIndex } = readFlagValue(argv, index, arg);
      options.workspaceId = value;
      index = nextIndex;
      continue;
    }
    if (arg === "--label") {
      const { value, nextIndex } = readFlagValue(argv, index, arg);
      options.label = value;
      index = nextIndex;
      continue;
    }
    if (arg === "--created-at") {
      const { value, nextIndex } = readFlagValue(argv, index, arg);
      options.createdAt = value;
      index = nextIndex;
      continue;
    }
    if (arg === "--created-by") {
      const { value, nextIndex } = readFlagValue(argv, index, arg);
      options.createdBy = value;
      index = nextIndex;
      continue;
    }
    if (arg === "--core-version") {
      const { value, nextIndex } = readFlagValue(argv, index, arg);
      options.coreVersion = value;
      index = nextIndex;
      continue;
    }
    if (arg === "--description") {
      const { value, nextIndex } = readFlagValue(argv, index, arg);
      options.description = value;
      index = nextIndex;
      continue;
    }
    throw new Error(
      arg.startsWith("--") ? `Unknown create-workspace flag: ${arg}` : `Unexpected create-workspace argument: ${arg}`
    );
  }

  if (options.rootDir === undefined) {
    throw new Error("create-workspace requires --workspace <root>");
  }
  if (options.label === undefined) {
    throw new Error("create-workspace requires --label <label>");
  }

  const workspaceId = options.workspaceId ?? generatedWorkspaceId();
  return {
    rootDir: options.rootDir,
    workspaceId,
    label: options.label,
    createdBy: options.createdBy ?? "cestus-local-runtime",
    ...(options.createdAt === undefined ? {} : { createdAt: options.createdAt }),
    ...(options.coreVersion === undefined ? {} : { coreVersion: options.coreVersion }),
    ...(options.description === undefined ? {} : { description: options.description })
  };
}

function parseAgentCreateTaskArgs(argv: readonly string[]): {
  readonly taskId: string;
  readonly title: string;
  readonly priority?: string;
} {
  const options: {
    taskId?: string;
    title?: string;
    priority?: string;
  } = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) {
      continue;
    }
    if (arg === "--task-id") {
      const { value, nextIndex } = readFlagValue(argv, index, arg);
      options.taskId = value;
      index = nextIndex;
      continue;
    }
    if (arg === "--title") {
      const { value, nextIndex } = readFlagValue(argv, index, arg);
      options.title = value;
      index = nextIndex;
      continue;
    }
    if (arg === "--priority") {
      const { value, nextIndex } = readFlagValue(argv, index, arg);
      options.priority = parseAgentTaskPriority(value);
      index = nextIndex;
      continue;
    }

    throw new Error(
      arg.startsWith("--") ? "Unknown agent-create-task flag." : "Unexpected agent-create-task argument."
    );
  }

  if (options.taskId === undefined) {
    throw new Error("agent-create-task requires --task-id <id>");
  }
  if (options.title === undefined) {
    throw new Error("agent-create-task requires --title <title>");
  }

  return {
    taskId: options.taskId,
    title: options.title,
    ...(options.priority === undefined ? {} : { priority: options.priority })
  };
}

function parseAgentTaskPriority(value: string): string {
  if (value === "normal" || value === "high" || value === "low") {
    return value;
  }
  throw new Error("agent-create-task --priority must be one of normal, high, or low");
}

function parseAgentProviderSmokeArgs(argv: readonly string[]): void {
  for (const arg of argv) {
    if (arg !== "--json") {
      throw new Error("Unknown agent-provider-smoke flag.");
    }
  }
}

function generatedWorkspaceId(): string {
  return `ws_${randomUUID().replaceAll("-", "_")}`;
}

function readFlagValue(
  argv: readonly string[],
  index: number,
  flag: string
): { readonly value: string; readonly nextIndex: number } {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}`);
  }
  return { value, nextIndex: index + 1 };
}

function parseConfigureBindMode(value: string): ConfigureFlags["bindMode"] {
  if (value === "loopback" || value === "tailnet" || value === "lan") {
    return value;
  }
  throw new Error("Configure --bind must be one of loopback, tailnet, or lan");
}

function parseConfigureStorageStrategy(value: string): ConfigureFlags["storageStrategy"] {
  if (
    value === "repo-local" ||
    value === "explicit-path" ||
    value === "app-data" ||
    value === "portable-workspace"
  ) {
    return value;
  }
  throw new Error(
    "Configure --storage must be one of repo-local, explicit-path, app-data, or portable-workspace"
  );
}

function parseConfigurePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid configure port: ${value}`);
  }
  return port;
}

function agentCliJson(value: unknown): string {
  return JSON.stringify(sanitizeAgentCliOutput(value), null, 2);
}

function sanitizeAgentCliOutput(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") {
    return redactSecretText(value);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (seen.has(value)) {
    return "[redacted]";
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeAgentCliOutput(item, seen));
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (!descriptor.enumerable) {
      continue;
    }

    const sanitizedKey = redactSecretText(key);
    sanitized[sanitizedKey] = "value" in descriptor
      ? sanitizeAgentCliOutput(descriptor.value, seen)
      : "[redacted]";
  }
  return sanitized;
}

function redactSecretText(value: string): string {
  const redacted = value
    .replace(/(?:^|[^a-z0-9])sk[._-](?:live|test|proj)[\w._~+/=-]*/gi, (match) =>
      match.startsWith("s") || match.startsWith("S") ? "[redacted]" : `${match.slice(0, 1)}[redacted]`
    )
    .replace(
      /\b[A-Z][A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|CREDENTIAL|API_KEY|PRIVATE_KEY)[A-Z0-9_]*\b(?:=[^\s,;]+)?/g,
      "[redacted]"
    )
    .replace(
      /\b(?:access[\s._-]*bearer|api[\s._-]*key|authorization|bearer|password|private[\s._-]*key|client[\s._-]*secret|refresh[\s._-]*secret|session[\s._-]*secret|oauth|credential)(?:\s*[:=]\s*|\s+)[^\s,;]+/gi,
      "[redacted]"
    );

  if (redacted !== value) {
    return redacted;
  }

  if (/\b(?:bearer|password|private[\s._-]*key|access[\s._-]*token|api[\s._-]*key)\b/i.test(redacted)) {
    return "[redacted]";
  }

  return redacted;
}

function redactDiagnosticText(value: string): string {
  const redacted = redactSecretText(value);
  if (redacted !== value) {
    return redacted;
  }

  if (/\b(?:bearer|password|private[\s._-]*key)\b/i.test(redacted)) {
    return "Local runtime command failed with a redacted diagnostic.";
  }

  return redacted;
}

type RedactedLocalRuntimeConfig = Omit<ResolvedLocalRuntimeConfig, "http"> & {
  readonly http: Omit<ResolvedLocalRuntimeConfig["http"], "authToken"> & {
    readonly authToken?: "[redacted]";
  };
};

const entrypoint = process.argv[1] === undefined ? undefined : pathToFileURL(process.argv[1]).href;

if (import.meta.url === entrypoint) {
  const exitCode = await runLocalRuntimeCli(process.argv.slice(2));
  process.exitCode = exitCode;
}
