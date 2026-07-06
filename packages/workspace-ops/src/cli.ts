import { formatWorkspaceOpsJson, type WorkspaceOpsEnvelope } from "./contracts.js";

type WorkspaceOpsCliOperation = (input: WorkspaceOpsCliOperationContext) => Promise<WorkspaceOpsEnvelope>;

export interface WorkspaceOpsCliOperations {
  readonly verifyWorkspace?: WorkspaceOpsCliOperation;
  readonly diskUsage?: WorkspaceOpsCliOperation;
  readonly detectDrive?: WorkspaceOpsCliOperation;
  readonly projectionRebuildReadiness?: WorkspaceOpsCliOperation;
  readonly projectionRebuild?: WorkspaceOpsCliOperation;
  readonly diagnosticsInspect?: WorkspaceOpsCliOperation;
  readonly manifestExport?: WorkspaceOpsCliOperation;
  readonly backupCheck?: WorkspaceOpsCliOperation;
}

export interface WorkspaceOpsCliDependencies {
  readonly stdout?: (line: string) => void;
  readonly operations: WorkspaceOpsCliOperations;
}

export interface WorkspaceOpsCliOperationContext {
  readonly argv: readonly string[];
  readonly command: WorkspaceOpsCliCommand;
}

export type WorkspaceOpsCliCommand =
  | "verify workspace"
  | "disk usage"
  | "detect drive"
  | "projection rebuild-readiness"
  | "projection rebuild"
  | "diagnostics inspect"
  | "manifest export"
  | "backup check";

export async function runWorkspaceOpsCli(
  argv: readonly string[],
  dependencies: WorkspaceOpsCliDependencies
): Promise<number> {
  const stdout = dependencies.stdout ?? ((line: string) => process.stdout.write(line));
  const normalized = normalizeCommand(argv);

  if (normalized.kind === "help") {
    stdout(`${formatWorkspaceOpsCliUsage()}\n`);
    return 0;
  }

  if (normalized.kind === "unsupported") {
    stdout(formatWorkspaceOpsCliJson(unsupportedCommand(normalized.command)));
    return 1;
  }

  const operation = operationFor(normalized.command, dependencies.operations);
  if (operation === undefined) {
    stdout(formatWorkspaceOpsCliJson(runtimeWiringRequired(normalized.command)));
    return 1;
  }

  try {
    const envelope = await operation({ argv, command: normalized.command });
    stdout(formatWorkspaceOpsJson(envelope));
    return exitCodeForStatus(envelope.status);
  } catch {
    stdout(formatWorkspaceOpsCliJson(operationFailed(normalized.command)));
    return 1;
  }
}

export function formatWorkspaceOpsCliUsage(executableName = "cestus-workspace"): string {
  return [
    `Usage: ${executableName} <command> [options]`,
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
    "JSON is the stable output contract. HTTP and UI adapters should call package operations directly."
  ].join("\n");
}

function normalizeCommand(argv: readonly string[]):
  | { readonly kind: "help" }
  | { readonly kind: "supported"; readonly command: WorkspaceOpsCliCommand }
  | { readonly kind: "unsupported"; readonly command: string } {
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
  if (first === "diagnostics" && second === "inspect") {
    return { kind: "supported", command: "diagnostics inspect" };
  }
  if (first === "manifest" && second === "export") return { kind: "supported", command: "manifest export" };
  if (first === "backup" && second === "check") return { kind: "supported", command: "backup check" };

  return { kind: "unsupported", command: argv.join(" ") };
}

function operationFor(
  command: WorkspaceOpsCliCommand,
  operations: WorkspaceOpsCliOperations
): WorkspaceOpsCliOperation | undefined {
  switch (command) {
    case "verify workspace":
      return operations.verifyWorkspace;
    case "disk usage":
      return operations.diskUsage;
    case "detect drive":
      return operations.detectDrive;
    case "projection rebuild-readiness":
      return operations.projectionRebuildReadiness;
    case "projection rebuild":
      return operations.projectionRebuild;
    case "diagnostics inspect":
      return operations.diagnosticsInspect;
    case "manifest export":
      return operations.manifestExport;
    case "backup check":
      return operations.backupCheck;
  }
}

function exitCodeForStatus(status: WorkspaceOpsEnvelope["status"]): number {
  if (status === "ready") return 0;
  if (status === "degraded") return 2;
  return 3;
}

function unsupportedCommand(command: string): WorkspaceOpsCliErrorOutput {
  return {
    ok: false,
    error: {
      code: "WORKSPACE_OPS_COMMAND_UNSUPPORTED",
      command,
      message: `Unsupported workspace ops command ${command}.`
    }
  };
}

function runtimeWiringRequired(command: string): WorkspaceOpsCliErrorOutput {
  return {
    ok: false,
    error: {
      code: "WORKSPACE_OPS_RUNTIME_WIRING_REQUIRED",
      command,
      message: `Workspace ops command ${command} requires injected operations; pure CLI handlers do not use hidden globals.`
    }
  };
}

function operationFailed(command: string): WorkspaceOpsCliErrorOutput {
  return {
    ok: false,
    error: {
      code: "WORKSPACE_OPS_OPERATION_FAILED",
      command,
      message: `Workspace ops command ${command} failed before producing a JSON envelope.`
    }
  };
}

function formatWorkspaceOpsCliJson(value: WorkspaceOpsCliErrorOutput): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

interface WorkspaceOpsCliErrorOutput {
  readonly ok: false;
  readonly error: {
    readonly code: string;
    readonly command: string;
    readonly message: string;
  };
}
