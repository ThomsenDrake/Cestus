import { pathToFileURL } from "node:url";
import {
  resolveLocalRuntimeConfig,
  type LocalRuntimeConfigInput,
  type ResolvedLocalRuntimeConfig
} from "./config.js";
import {
  redactLocalRuntimeConfigFile,
  writeLocalRuntimeOnboardingConfig,
  type WriteLocalRuntimeOnboardingConfigInput
} from "./config-file.js";
import { createLocalRuntimeHttpHandler } from "./http-handler.js";
import { startLocalRuntimeServer } from "./server.js";

export interface LocalRuntimeCliDependencies {
  readonly cwd?: string;
  readonly env?: Record<string, string | undefined>;
  readonly stdout?: (line: string) => void;
  readonly stderr?: (line: string) => void;
  readonly serve?: () => Promise<void>;
  readonly seedPrr?: () => Promise<unknown>;
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
        ...parseConfigureArgs(argv.slice(1))
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

    stderr(`Unknown local runtime command: ${command}`);
    return 1;
  } catch (error) {
    stderr(error instanceof Error ? error.message : String(error));
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
    ...(options.distDir === undefined ? {} : { distDir: options.distDir }),
    ...(options.logDir === undefined ? {} : { logDir: options.logDir }),
    ...(options.devSeedEnabled === undefined ? {} : { devSeedEnabled: options.devSeedEnabled }),
    ...(options.rotateAuthToken === undefined ? {} : { rotateAuthToken: options.rotateAuthToken })
  };
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
  if (value === "repo-local" || value === "explicit-path" || value === "app-data") {
    return value;
  }
  throw new Error("Configure --storage must be one of repo-local, explicit-path, or app-data");
}

function parseConfigurePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid configure port: ${value}`);
  }
  return port;
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
