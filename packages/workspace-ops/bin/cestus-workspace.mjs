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
  const command = safeCommandSummary(args);
  process.stderr.write(formatJson({
    ok: false,
    error: {
      code: "WORKSPACE_OPS_COMMAND_UNSUPPORTED",
      command,
      message: `Unsupported workspace ops command ${command}.`
    }
  }));
  process.exit(1);
}

const command = safeCommandSummary(args, normalized.command);
process.stderr.write(formatJson({
  ok: false,
  error: {
    code: "WORKSPACE_OPS_RUNTIME_WIRING_REQUIRED",
    command,
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
  if (first === "verify" && second === "workspace") return { kind: "supported", command: "verify workspace" };
  if (first === "disk" && second === "usage") return { kind: "supported", command: "disk usage" };
  if (first === "detect" && second === "drive") return { kind: "supported", command: "detect drive" };
  if (first === "projection" && second === "rebuild-readiness") {
    return { kind: "supported", command: "projection rebuild-readiness" };
  }
  if (first === "projection" && second === "rebuild") return { kind: "supported", command: "projection rebuild" };
  if (first === "diagnostics" && second === "inspect") return { kind: "supported", command: "diagnostics inspect" };
  if (first === "manifest" && second === "export") return { kind: "supported", command: "manifest export" };
  if (first === "backup" && second === "check") return { kind: "supported", command: "backup check" };

  return { kind: "unsupported", command: argv.join(" ") };
}

function formatJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function safeCommandSummary(argv, baseCommand) {
  const command = argv.join(" ");
  if (command.length === 0) {
    return baseCommand ?? "unsupported command";
  }

  if (!hasSecretShapedArgv(argv) && isSecretSafeText(command)) {
    return command;
  }

  return baseCommand === undefined ? "unsupported command" : `${baseCommand} [redacted]`;
}

function hasSecretShapedArgv(argv) {
  return argv.some((arg) => isSecretShapedOptionName(arg));
}

function isSecretShapedOptionName(arg) {
  if (!arg.startsWith("-")) {
    return false;
  }

  const [rawName] = arg.replace(/^-+/, "").split("=", 1);
  if (rawName === undefined || rawName.length === 0) {
    return false;
  }

  const parts = rawName
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((part) => part.length > 0);
  const compact = parts.join("");
  const secretTerms = new Set([
    "authorization",
    "bearer",
    "credential",
    "credentials",
    "oauth",
    "password",
    "token"
  ]);
  const secretCompounds = new Set([
    "accesstoken",
    "apikey",
    "clientsecret",
    "privatekey",
    "refreshsecret",
    "sessionsecret"
  ]);

  if (parts.some((part) => secretTerms.has(part)) || secretCompounds.has(compact)) {
    return true;
  }

  return [
    ["access", "token"],
    ["api", "key"],
    ["client", "secret"],
    ["private", "key"],
    ["refresh", "secret"],
    ["session", "secret"]
  ].some(([first, second]) =>
    parts.some((part, index) => part === first && parts[index + 1] === second)
  );
}

function isSecretSafeText(value) {
  return !/(?:^|[^a-z0-9])(?:access[\s._-]*token|api[\s._-]*key|authorization|bearer|token|password|private[\s._-]*key|client[\s._-]*secret|refresh[\s._-]*secret|session[\s._-]*secret|oauth|credential)(?:\s*[:=]\s*|\s+)(?=[a-z0-9._~+/=-]{3,})[a-z0-9][a-z0-9._~+/=-]*/i.test(value);
}
