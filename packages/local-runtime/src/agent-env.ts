import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface LocalAgentEnv {
  readonly nousApiKey?: string;
  readonly nousEndpoint?: string;
  readonly nousModel?: string;
}

export function loadLocalAgentEnv(input: {
  readonly cwd: string;
  readonly env?: Record<string, string | undefined>;
}): LocalAgentEnv {
  const fileEnv = readDotEnvFile(join(input.cwd, ".env"));
  const merged = {
    ...fileEnv,
    ...(input.env ?? process.env)
  };
  const nousApiKey = normalizeOptional(merged.CESTUS_AGENT_NOUS_API_KEY);
  const nousEndpoint = normalizeOptional(merged.CESTUS_AGENT_NOUS_ENDPOINT);
  const nousModel = normalizeOptional(merged.CESTUS_AGENT_NOUS_MODEL);

  return Object.freeze({
    ...(nousApiKey === undefined ? {} : { nousApiKey }),
    ...(nousEndpoint === undefined ? {} : { nousEndpoint }),
    ...(nousModel === undefined ? {} : { nousModel })
  });
}

function readDotEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) {
    return {};
  }

  const parsed: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const assignment = parseDotEnvLine(line);
    if (assignment !== undefined) {
      parsed[assignment.key] = assignment.value;
    }
  }
  return parsed;
}

function parseDotEnvLine(line: string): { readonly key: string; readonly value: string } | undefined {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.startsWith("#")) {
    return undefined;
  }

  const withoutExport = trimmed.startsWith("export ") ? trimmed.slice("export ".length).trimStart() : trimmed;
  const separatorIndex = withoutExport.indexOf("=");
  if (separatorIndex <= 0) {
    return undefined;
  }

  const key = withoutExport.slice(0, separatorIndex).trim();
  if (!/^[A-Z][A-Z0-9_]*$/.test(key)) {
    return undefined;
  }

  const rawValue = withoutExport.slice(separatorIndex + 1).trim();
  return {
    key,
    value: stripMatchingQuotes(rawValue)
  };
}

function stripMatchingQuotes(value: string): string {
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function normalizeOptional(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}
