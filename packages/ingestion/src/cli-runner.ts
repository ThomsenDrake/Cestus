import {
  formatIngestionCliUsage,
  handleIngestionCommand,
  normalizeIngestionCliArgs
} from "./cli.js";

export async function runIngestionCli(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  const normalized = normalizeIngestionCliArgs(argv);
  if (normalized.kind === "help") {
    process.stdout.write(`${formatIngestionCliUsage("cestus-ingest")}\n`);
    return 0;
  }

  if (isPureCliCommand(normalized.command)) {
    const output = await handleIngestionCommand({
      command: normalized.command,
      argv: normalized.argv
    });
    process.stdout.write(output);
    return JSON.parse(output).ok === true ? 0 : 1;
  }

  const {
    createIngestionRuntime,
    createLegacyImportRuntime,
    createPortableIngestionMountResolver
  } = await import("./index.js");

  const output = await handleIngestionCommand({
    command: normalized.command,
    argv: normalized.argv,
    mountResolver: createPortableIngestionMountResolver(),
    runtimeFactory: ({ mountedWorkspace }) => createIngestionRuntime({
      mountedWorkspace,
      actor: { id: "actor_ingestion_cli", kind: "human", label: "Ingestion CLI" }
    }),
    legacyRuntimeFactory: ({ mountedWorkspace }) => createLegacyImportRuntime({
      mountedWorkspace,
      actor: { id: "actor_legacy_cli", kind: "human", label: "Legacy CLI" }
    })
  });
  process.stdout.write(output);
  return JSON.parse(output).ok === true ? 0 : 1;
}

function isPureCliCommand(command: string): boolean {
  return command === "summary-json" ||
    command === "legacy-artifact-ask-json" ||
    command === "legacy artifact-ask";
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runIngestionCli().then((code) => process.exit(code));
}
