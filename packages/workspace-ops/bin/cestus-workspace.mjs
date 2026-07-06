#!/usr/bin/env node

const usage = [
  "Usage: cestus-workspace <command> [options]",
  "",
  "Commands:",
  "  verify workspace                 Verify portable workspace state.",
  "  disk usage                       Report workspace disk usage by category.",
  "  detect drive                     Detect missing, unmounted, or wrong-drive state.",
  "  projection rebuild-readiness     Check projection rebuild prerequisites.",
  "  projection rebuild               Rebuild expendable projection artifacts.",
  "  diagnostics inspect              Inspect durable and derived diagnostics.",
  "  manifest export                  Export a secret-free workspace manifest summary.",
  "  backup check                     Check backup manifest coverage.",
  "",
  "Options:",
  "  --help                           Show this help.",
  "",
  "JSON is the stable output contract. Operational commands require explicit package wiring."
].join("\n");

const args = process.argv.slice(2);
const normalized = normalizeCommand(args);

if (normalized.kind === "help") {
  process.stdout.write(`${usage}\n`);
  process.exit(0);
}

if (normalized.kind === "unsupported") {
  process.stderr.write(formatJson({
    ok: false,
    error: {
      code: "WORKSPACE_OPS_COMMAND_UNSUPPORTED",
      command: normalized.command,
      message: `Unsupported workspace ops command ${normalized.command}.`
    }
  }));
  process.exit(1);
}

process.stderr.write(formatJson({
  ok: false,
  error: {
    code: "WORKSPACE_OPS_RUNTIME_WIRING_REQUIRED",
    command: args.join(" "),
    message: "Workspace ops executable commands require explicit package wiring; the executable does not use hidden globals."
  }
}));
process.exit(1);

function normalizeCommand(argv) {
  if (
    argv.length === 0 ||
    argv[0] === "help" ||
    argv.includes("--help") ||
    argv.includes("-h")
  ) {
    return { kind: "help" };
  }

  const first = argv[0] ?? "";
  const second = argv[1] ?? "";
  if (first === "verify" && second === "workspace") return { kind: "supported" };
  if (first === "disk" && second === "usage") return { kind: "supported" };
  if (first === "detect" && second === "drive") return { kind: "supported" };
  if (first === "projection" && second === "rebuild-readiness") return { kind: "supported" };
  if (first === "projection" && second === "rebuild") return { kind: "supported" };
  if (first === "diagnostics" && second === "inspect") return { kind: "supported" };
  if (first === "manifest" && second === "export") return { kind: "supported" };
  if (first === "backup" && second === "check") return { kind: "supported" };

  return { kind: "unsupported", command: argv.join(" ") };
}

function formatJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}
