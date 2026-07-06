#!/usr/bin/env node

const operationalCommands = new Set([
  "register-source",
  "dry-run",
  "approve-import",
  "import",
  "jobs",
  "list-jobs",
  "retry",
  "approve-provider",
  "diagnostics"
]);

const usage = [
  "Usage: cestus-ingest [ingest] <command> [options]",
  "",
  "Commands:",
  "  summary-json        Print a stable JSON ingestion review DTO.",
  "  register-source     Register a read-only source collection.",
  "  dry-run             Run a hash-computing dry-run inventory.",
  "  approve-import      Approve a dry-run batch for raw import.",
  "  import              Import approved unique evidence blobs.",
  "  jobs                List ingestion jobs.",
  "  retry               Retry a failed ingestion job.",
  "  approve-provider    Approve an outbound provider parse batch.",
  "  diagnostics         Inspect ingestion diagnostics.",
  "",
  "Options:",
  "  --workspace <root>  Portable workspace root to resolve through the mount layer.",
  "  --help              Show this help.",
  "",
  "Examples:",
  "  cestus ingest dry-run --workspace <root> --source-id src_drive_001 --scan scan_001",
  "  cestus ingest register-source --workspace <root> --source /Volumes/OldArchive --source-id src_old_archive --label \"Old archive\""
].join("\n");

const args = normalizeArgs(process.argv.slice(2));

if (args.includes("--help") || args.includes("-h") || args.length === 0) {
  console.log(usage);
  process.exit(0);
}

const command = args[0];

if (command === "summary-json") {
  console.error(formatJson({
    ok: false,
    error: {
      code: "INGESTION_SUMMARY_DTO_REQUIRED",
      command,
      message: "Command summary-json needs an ingestion review DTO from runtime wiring."
    }
  }));
  process.exit(1);
}

if (operationalCommands.has(command)) {
  console.error(formatJson({
    ok: false,
    error: {
      code: "INGESTION_RUNTIME_WIRING_REQUIRED",
      command,
      message: `Command ${command} needs a runtime wiring object; the executable does not use hidden globals.`
    }
  }));
  process.exit(1);
}

console.error(formatJson({
  ok: false,
  error: {
    code: "INGESTION_COMMAND_UNSUPPORTED",
    command,
    message: `Unsupported ingestion command ${command}.`
  }
}));
process.exit(1);

function normalizeArgs(args) {
  return args[0] === "ingest" ? args.slice(1) : args;
}

function formatJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}
