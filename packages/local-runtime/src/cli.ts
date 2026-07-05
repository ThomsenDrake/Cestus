import { pathToFileURL } from "node:url";
import {
  resolveLocalRuntimeConfig,
  type LocalRuntimeConfigInput,
  type ResolvedLocalRuntimeConfig
} from "./config.js";
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
