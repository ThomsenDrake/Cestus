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
  readonly derivedDiagnostics: readonly unknown[];
}

type DiagnosticRecordedEvent = KnowledgeEventOf<"diagnostic.recorded">;
type WorkspaceDiagnosticCategory = WorkspaceDiagnosticInput["category"];
type NormalizedDurableEvent =
  | { readonly kind: "diagnostic"; readonly value: unknown }
  | { readonly kind: "invalid-diagnostic" }
  | { readonly kind: "skip" };
type DescriptorCloneResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false };
interface NormalizedDerivedDiagnosticInput {
  readonly diagnosticId: unknown;
  readonly severity: unknown;
  readonly category: unknown;
  readonly message: unknown;
  readonly relatedIds: readonly unknown[];
  readonly repairHint: {
    readonly allowedNextCommands: readonly unknown[];
    readonly requiresHumanApproval: unknown;
  };
}

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
    const normalizedEvent = normalizeDurableDiagnosticEvent(event);
    if (normalizedEvent.kind === "skip") {
      continue;
    }

    if (normalizedEvent.kind === "invalid-diagnostic") {
      if (!redactedInvalidDurableDiagnostic) {
        derivedDiagnostics.push(redactedDurableDiagnostic());
        redactedInvalidDurableDiagnostic = true;
      }
      continue;
    }

    const eventResult = validateKnowledgeEvent(normalizedEvent.value);
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

function sanitizeDerivedDiagnostic(diagnostic: unknown): WorkspaceDiagnosticDto {
  const normalizedDiagnostic = normalizeDerivedDiagnostic(diagnostic);
  if (normalizedDiagnostic === undefined) {
    return redactedDerivedDiagnostic();
  }

  return {
    diagnosticId: safeDiagnosticId(normalizedDiagnostic.diagnosticId),
    severity: safeSeverity(normalizedDiagnostic.severity),
    category: safeWorkspaceCategory(normalizedDiagnostic.category),
    message: safeDiagnosticMessage(normalizedDiagnostic.message),
    durable: false,
    relatedIds: safeRelatedIds(normalizedDiagnostic.relatedIds),
    repairHint: {
      allowedNextCommands: safeAllowedCommands(normalizedDiagnostic.repairHint.allowedNextCommands),
      requiresHumanApproval: normalizedDiagnostic.repairHint.requiresHumanApproval === true
    }
  };
}

function redactedDurableDiagnostic(): WorkspaceDiagnosticDto {
  return {
    diagnosticId: "diag_durable_diagnostic_event_redacted",
    severity: "error",
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

function redactedDerivedDiagnostic(): WorkspaceDiagnosticDto {
  return {
    diagnosticId: "diag_diagnostic_redacted",
    severity: "error",
    category: "diagnostics",
    message: "Diagnostic message was redacted.",
    durable: false,
    relatedIds: [],
    repairHint: {
      allowedNextCommands: ["diagnostics inspect"],
      requiresHumanApproval: false
    }
  };
}

function normalizeDurableDiagnosticEvent(event: unknown): NormalizedDurableEvent {
  if (!isPlainRecord(event)) {
    return { kind: "skip" };
  }

  const descriptors = Object.getOwnPropertyDescriptors(event);
  if (!Object.hasOwn(descriptors, "type")) {
    return { kind: "skip" };
  }

  const type = descriptorValue(descriptors, "type");
  if (type === undefined) {
    return { kind: "invalid-diagnostic" };
  }
  if (type !== "diagnostic.recorded") {
    return { kind: "skip" };
  }

  const normalized = descriptorSafeClone(event);
  return normalized.ok
    ? { kind: "diagnostic", value: normalized.value }
    : { kind: "invalid-diagnostic" };
}

function normalizeDerivedDiagnostic(
  diagnostic: unknown
): NormalizedDerivedDiagnosticInput | undefined {
  if (!isPlainRecord(diagnostic)) {
    return undefined;
  }

  const descriptors = Object.getOwnPropertyDescriptors(diagnostic);
  if (hasUnsafeDescriptor(descriptors)) {
    return undefined;
  }

  const repairHint = normalizeRepairHint(descriptorValue(descriptors, "repairHint"));
  if (repairHint === undefined) {
    return undefined;
  }

  const relatedIds = descriptorArrayValue(descriptorValue(descriptors, "relatedIds"));
  if (relatedIds === undefined) {
    return undefined;
  }

  const diagnosticId = descriptorValue(descriptors, "diagnosticId");
  const severity = descriptorValue(descriptors, "severity");
  const category = descriptorValue(descriptors, "category");
  const message = descriptorValue(descriptors, "message");
  if (diagnosticId === undefined || severity === undefined || category === undefined || message === undefined) {
    return undefined;
  }

  return {
    diagnosticId,
    severity,
    category,
    message,
    relatedIds,
    repairHint
  };
}

function normalizeRepairHint(value: unknown): NormalizedDerivedDiagnosticInput["repairHint"] | undefined {
  if (!isPlainRecord(value)) {
    return undefined;
  }

  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (hasUnsafeDescriptor(descriptors)) {
    return undefined;
  }

  const allowedNextCommands = descriptorArrayValue(descriptorValue(descriptors, "allowedNextCommands"));
  const requiresHumanApproval = descriptorValue(descriptors, "requiresHumanApproval");
  return allowedNextCommands === undefined || requiresHumanApproval === undefined
    ? undefined
    : { allowedNextCommands, requiresHumanApproval };
}

function descriptorSafeClone(value: unknown, seen = new WeakSet<object>()): DescriptorCloneResult {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return { ok: true, value };
  }
  if (typeof value !== "object") {
    return { ok: false };
  }
  if (seen.has(value)) {
    return { ok: false };
  }
  seen.add(value);

  if (Array.isArray(value)) {
    const arrayValue = descriptorArrayValue(value, seen);
    seen.delete(value);
    return arrayValue === undefined ? { ok: false } : { ok: true, value: arrayValue };
  }

  if (!isPlainRecord(value)) {
    seen.delete(value);
    return { ok: false };
  }

  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (hasUnsafeDescriptor(descriptors)) {
    seen.delete(value);
    return { ok: false };
  }

  const clone: Record<string, unknown> = {};
  for (const key of Object.keys(descriptors)) {
    const descriptor = descriptors[key];
    if (descriptor === undefined || !("value" in descriptor)) {
      seen.delete(value);
      return { ok: false };
    }
    const clonedValue = descriptorSafeClone(descriptor.value, seen);
    if (!clonedValue.ok) {
      seen.delete(value);
      return { ok: false };
    }
    clone[key] = clonedValue.value;
  }

  seen.delete(value);
  return { ok: true, value: clone };
}

function descriptorArrayValue(value: unknown, seen = new WeakSet<object>()): readonly unknown[] | undefined {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    return undefined;
  }

  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (
      key !== "length" &&
      (typeof key !== "string" || !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length)
    ) {
      return undefined;
    }

    const descriptor = descriptors[key];
    if (key !== "length" && (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor))) {
      return undefined;
    }
  }

  const values: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (descriptor === undefined || !("value" in descriptor)) {
      return undefined;
    }
    const clonedValue = descriptorSafeClone(descriptor.value, seen);
    if (!clonedValue.ok) {
      return undefined;
    }
    values.push(clonedValue.value);
  }

  return values;
}

function descriptorValue(
  descriptors: PropertyDescriptorMap,
  key: string
): unknown {
  const descriptor = descriptors[key];
  return descriptor !== undefined && "value" in descriptor ? descriptor.value : undefined;
}

function hasUnsafeDescriptor(descriptors: PropertyDescriptorMap): boolean {
  return Reflect.ownKeys(descriptors).some((key) => {
    if (typeof key !== "string") {
      return true;
    }
    const descriptor = descriptors[key];
    return descriptor === undefined || !descriptor.enumerable || !("value" in descriptor);
  });
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype;
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

function safeWorkspaceCategory(category: unknown): WorkspaceDiagnosticCategory {
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
  return typeof category === "string" && workspaceCategories.has(category as WorkspaceDiagnosticCategory)
    ? category as WorkspaceDiagnosticCategory
    : "diagnostics";
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

function safeDiagnosticMessage(message: unknown): string {
  return typeof message === "string" && isSafeDiagnosticMessage(message)
    ? message
    : "Diagnostic message was redacted.";
}

function isSafeDiagnosticMessage(message: string): boolean {
  return isSecretSafeWorkspaceText(message) && !/(?:raw private|private case|private correspondence)/i.test(message);
}

function safeDiagnosticId(diagnosticId: unknown): WorkspaceDiagnosticInput["diagnosticId"] {
  return typeof diagnosticId === "string" &&
    /^diag_[a-zA-Z0-9_-]+$/.test(diagnosticId) &&
    isSecretSafeWorkspaceText(diagnosticId) &&
    !/token|password|credential|secret/i.test(diagnosticId)
    ? diagnosticId
    : "diag_diagnostic_redacted";
}

function safeSeverity(severity: unknown): WorkspaceDiagnosticInput["severity"] {
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
