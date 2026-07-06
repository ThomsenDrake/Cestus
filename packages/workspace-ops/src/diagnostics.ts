import { validateKnowledgeEvent, type KnowledgeEventOf } from "../../ontology/src/contracts.js";
import {
  createWorkspaceOpsEnvelope,
  isSecretSafeWorkspaceText,
  workspaceOpsSchemaVersion,
  type DiagnosticsInspectDto,
  type WorkspaceDiagnosticDto,
  type WorkspaceDiagnosticInput,
  type WorkspaceOpsCommand,
  type WorkspaceOpsEnvelope
} from "./contracts.js";

export interface InspectWorkspaceDiagnosticsInput {
  readonly durableEvents: readonly unknown[];
  readonly derivedDiagnostics: readonly WorkspaceDiagnosticInput[];
}

type DiagnosticRecordedEvent = KnowledgeEventOf<"diagnostic.recorded">;
type WorkspaceDiagnosticCategory = WorkspaceDiagnosticInput["category"];

const workspaceCommands = new Set<WorkspaceOpsCommand>([
  "verify workspace",
  "disk usage",
  "detect drive",
  "projection rebuild-readiness",
  "projection rebuild",
  "diagnostics inspect",
  "manifest export",
  "backup check"
]);

export async function inspectWorkspaceDiagnostics(
  input: InspectWorkspaceDiagnosticsInput
): Promise<WorkspaceOpsEnvelope<DiagnosticsInspectDto>> {
  const durableDiagnostics: WorkspaceDiagnosticDto[] = [];
  const derivedDiagnostics: WorkspaceDiagnosticDto[] = [];
  let redactedInvalidDurableDiagnostic = false;

  for (const event of input.durableEvents) {
    if (rawEventType(event) !== "diagnostic.recorded") {
      continue;
    }

    const eventResult = validateKnowledgeEvent(event);
    if (!eventResult.success || eventResult.data.type !== "diagnostic.recorded") {
      if (!redactedInvalidDurableDiagnostic) {
        derivedDiagnostics.push(redactedDurableDiagnostic());
        redactedInvalidDurableDiagnostic = true;
      }
      continue;
    }

    durableDiagnostics.push(durableDiagnosticFromEvent(eventResult.data));
  }

  for (const diagnostic of input.derivedDiagnostics) {
    derivedDiagnostics.push(sanitizeDerivedDiagnostic(diagnostic));
  }

  const diagnostics = [...durableDiagnostics, ...derivedDiagnostics];
  return createWorkspaceOpsEnvelope({
    command: "diagnostics inspect",
    status: diagnostics.some((diagnostic) => diagnostic.severity === "error") ? "degraded" : "ready",
    payload: {
      schemaVersion: workspaceOpsSchemaVersion,
      diagnostics,
      durableCount: durableDiagnostics.length,
      derivedCount: derivedDiagnostics.length
    },
    diagnostics
  });
}

function durableDiagnosticFromEvent(event: DiagnosticRecordedEvent): WorkspaceDiagnosticDto {
  return {
    diagnosticId: event.payload.diagnosticId,
    severity: event.payload.severity,
    category: workspaceCategory(event.payload.category),
    message: safeDiagnosticMessage(event.payload.message),
    durable: true,
    relatedIds: safeRelatedIds([event.id]),
    repairHint: {
      allowedNextCommands: commandsForDurableDiagnostic(event.payload.category),
      requiresHumanApproval: false
    }
  };
}

function sanitizeDerivedDiagnostic(diagnostic: WorkspaceDiagnosticInput): WorkspaceDiagnosticDto {
  return {
    diagnosticId: safeDiagnosticId(diagnostic.diagnosticId),
    severity: safeSeverity(diagnostic.severity),
    category: safeWorkspaceCategory(diagnostic.category),
    message: safeDiagnosticMessage(diagnostic.message),
    durable: false,
    relatedIds: safeRelatedIds(arrayValue(diagnostic.relatedIds)),
    repairHint: {
      allowedNextCommands: safeAllowedCommands(arrayValue(diagnostic.repairHint.allowedNextCommands)),
      requiresHumanApproval: diagnostic.repairHint.requiresHumanApproval === true
    }
  };
}

function redactedDurableDiagnostic(): WorkspaceDiagnosticDto {
  return {
    diagnosticId: "diag_durable_diagnostic_event_redacted",
    severity: "warning",
    category: "diagnostics",
    message: "A durable diagnostic event could not be inspected safely and was redacted.",
    durable: false,
    relatedIds: [],
    repairHint: {
      allowedNextCommands: ["diagnostics inspect"],
      requiresHumanApproval: false
    }
  };
}

function rawEventType(event: unknown): string | undefined {
  if (typeof event !== "object" || event === null || !("type" in event)) {
    return undefined;
  }
  const type = (event as { readonly type?: unknown }).type;
  return typeof type === "string" ? type : undefined;
}

function workspaceCategory(category: DiagnosticRecordedEvent["payload"]["category"]): WorkspaceDiagnosticCategory {
  switch (category) {
    case "projection":
      return "projection";
    case "security":
    case "network":
    case "incident":
      return "security";
    case "export":
      return "backup";
    case "migration":
      return "layout";
    case "validation":
      return "manifest";
    case "ingestion":
    case "deduplication":
    case "governance":
      return "diagnostics";
  }
}

function safeWorkspaceCategory(category: WorkspaceDiagnosticInput["category"]): WorkspaceDiagnosticCategory {
  const workspaceCategories = new Set<WorkspaceDiagnosticCategory>([
    "manifest",
    "mount",
    "disk",
    "ledger",
    "blob-integrity",
    "projection",
    "diagnostics",
    "backup",
    "layout",
    "security"
  ]);
  return workspaceCategories.has(category) ? category : "diagnostics";
}

function commandsForDurableDiagnostic(
  category: DiagnosticRecordedEvent["payload"]["category"]
): [WorkspaceOpsCommand, ...WorkspaceOpsCommand[]] {
  switch (workspaceCategory(category)) {
    case "projection":
      return ["projection rebuild-readiness", "diagnostics inspect"];
    case "backup":
      return ["backup check", "manifest export"];
    case "manifest":
    case "layout":
    case "mount":
      return ["verify workspace", "diagnostics inspect"];
    case "disk":
      return ["disk usage", "diagnostics inspect"];
    case "ledger":
    case "blob-integrity":
    case "diagnostics":
    case "security":
      return ["diagnostics inspect"];
  }
}

function safeAllowedCommands(commands: readonly unknown[]): [WorkspaceOpsCommand, ...WorkspaceOpsCommand[]] {
  const safeCommands = commands.filter((command): command is WorkspaceOpsCommand =>
    typeof command === "string" && workspaceCommands.has(command as WorkspaceOpsCommand)
  );
  return safeCommands.length === 0
    ? ["diagnostics inspect"]
    : safeCommands as [WorkspaceOpsCommand, ...WorkspaceOpsCommand[]];
}

function safeDiagnosticMessage(message: string): string {
  return isSafeDiagnosticMessage(message) ? message : "Diagnostic message was redacted.";
}

function isSafeDiagnosticMessage(message: string): boolean {
  return isSecretSafeWorkspaceText(message) && !/(?:raw private|private case|private correspondence)/i.test(message);
}

function safeDiagnosticId(diagnosticId: string): WorkspaceDiagnosticInput["diagnosticId"] {
  return /^diag_[a-zA-Z0-9_-]+$/.test(diagnosticId) &&
    isSecretSafeWorkspaceText(diagnosticId) &&
    !/token|password|credential|secret/i.test(diagnosticId)
    ? diagnosticId
    : "diag_diagnostic_redacted";
}

function safeSeverity(severity: WorkspaceDiagnosticInput["severity"]): WorkspaceDiagnosticInput["severity"] {
  return severity === "info" || severity === "warning" || severity === "error" ? severity : "warning";
}

function safeRelatedIds(relatedIds: readonly unknown[]): string[] {
  return relatedIds.filter((relatedId): relatedId is string =>
    typeof relatedId === "string" &&
    /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(relatedId) &&
    isSecretSafeWorkspaceText(relatedId) &&
    !/token|password|credential|secret/i.test(relatedId)
  );
}

function arrayValue(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}
