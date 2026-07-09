import { z } from "zod";
import type { AgentToolApprovalClass, AgentToolSideEffectClass } from "./projection-types.js";
import { assertAgentSecretSafeText } from "./secret-safety.js";
import type {
  AgentToolFailureCategory,
  AgentToolPreview,
  AgentToolReadModelChange,
  AgentToolResult
} from "./tool-gateway.js";

export const agentSchedulerItemStateSchema = z.enum(["not-ready", "blocked", "resumed", "completed", "failed"]);

const agentToolApprovalClassValues = [
  "none",
  "human-review",
  "provider-byte-transfer",
  "external-message-send",
  "export-or-publication",
  "destructive-or-repair",
  "legal-escalation",
  "ledger-review"
] as const satisfies readonly AgentToolApprovalClass[];
const agentToolFailureCategoryValues = [
  "provider-unavailable",
  "provider-rate-limited",
  "credential-missing",
  "credential-revoked",
  "approval-required",
  "approval-denied",
  "approval-stale",
  "permission-denied",
  "secret-detected",
  "legal-lock-active",
  "lock-active",
  "projection-lag",
  "context-budget-exceeded",
  "missing-provenance",
  "provenance-missing",
  "model-output-invalid",
  "domain-gate-failed",
  "stale-source",
  "external-effect-failed",
  "data-loss-risk"
] as const satisfies readonly AgentToolFailureCategory[];
const approvedToolExecutionFailureKind = "agent-approved-tool-execution-failure.v1";

function secretSafeTextSchema(label: string) {
  return z.string().min(1).superRefine((value, ctx) => {
    try {
      assertAgentSecretSafeText(value, label);
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        message: error instanceof Error ? error.message : `${label} must be secret-safe.`
      });
    }
  });
}

function approvalClassIdentifierSchema(label: string) {
  return secretSafeTextSchema(label).refine(
    (value): value is AgentToolApprovalClass =>
      agentToolApprovalClassValues.includes(value as AgentToolApprovalClass),
    { message: `${label} must be a canonical approval-class identifier.` }
  );
}

export const agentSchedulerItemSummaryDtoSchema = z.object({
  toolRequestId: secretSafeTextSchema("scheduler tool request id"),
  runId: secretSafeTextSchema("scheduler run id"),
  taskId: secretSafeTextSchema("scheduler task id").optional(),
  toolId: secretSafeTextSchema("scheduler tool id"),
  toolVersion: secretSafeTextSchema("scheduler tool version"),
  state: agentSchedulerItemStateSchema,
  approvalClass: approvalClassIdentifierSchema("scheduler approval class"),
  previewHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  currentPreviewHash: z.string().regex(/^sha256:[a-f0-9]{64}$/).optional(),
  category: secretSafeTextSchema("scheduler category").optional(),
  message: secretSafeTextSchema("scheduler message").optional(),
  eventIds: z.array(z.string().regex(/^evt_[a-zA-Z0-9_-]+$/)),
  allowedNextActions: z.array(secretSafeTextSchema("scheduler allowed next action"))
}).strict();

export const agentSchedulerWakeResultDtoSchema = z.object({
  schemaVersion: z.literal("agent-scheduler-wake-result.v1"),
  generatedAt: z.string().datetime(),
  examinedCount: z.number().int().nonnegative(),
  resumedCount: z.number().int().nonnegative(),
  completedCount: z.number().int().nonnegative(),
  blockedCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  eventIds: z.array(z.string().regex(/^evt_[a-zA-Z0-9_-]+$/)),
  allowedNextActions: z.array(secretSafeTextSchema("scheduler allowed next action")),
  items: z.array(agentSchedulerItemSummaryDtoSchema)
}).strict();

export type AgentSchedulerItemState = z.infer<typeof agentSchedulerItemStateSchema>;
export type AgentSchedulerItemSummaryDto = z.infer<typeof agentSchedulerItemSummaryDtoSchema>;
export type AgentSchedulerWakeResultDto = z.infer<typeof agentSchedulerWakeResultDtoSchema>;

export interface AgentApprovedToolPreviewInput {
  readonly toolRequestId: string;
  readonly runId: string;
  readonly taskId?: string;
  readonly toolId: string;
  readonly toolVersion: string;
  readonly requestedPreviewHash: string;
}

export interface AgentApprovedToolFreshnessCheck {
  readonly name: string;
  readonly expected: string;
  readonly actual: string;
  readonly ok: boolean;
}

export interface AgentApprovedToolActiveLock {
  readonly lockId: string;
  readonly category: string;
  readonly message: string;
}

export interface AgentApprovedToolPreviewResult {
  readonly preview: AgentToolPreview;
  readonly sourceEventIds: readonly string[];
  readonly inputArtifactHashes: readonly string[];
  readonly provenanceRefs: readonly string[];
  readonly activeLocks: readonly AgentApprovedToolActiveLock[];
  readonly freshnessChecks: readonly AgentApprovedToolFreshnessCheck[];
}

export interface AgentApprovedToolExecutionInput {
  readonly toolRequestId: string;
  readonly runId: string;
  readonly taskId?: string;
  readonly toolId: string;
  readonly toolVersion: string;
  readonly sideEffectClass: AgentToolSideEffectClass;
  readonly approvalClass: AgentToolApprovalClass;
  readonly previewHash: string;
  readonly approvedPreviewHash: string;
  readonly approvedBy: string;
  readonly sourceEventIds: readonly string[];
  readonly inputArtifactHashes: readonly string[];
  readonly provenanceRefs: readonly string[];
}

export interface AgentApprovedToolExecutionResult extends AgentToolResult {
  readonly readModelChanges: readonly AgentToolReadModelChange[];
}

export interface AgentApprovedToolExecutorDescriptor {
  readonly toolId: string;
  readonly toolVersion: string;
  readonly sideEffectClass: AgentToolSideEffectClass;
  readonly approvalClass: AgentToolApprovalClass;
  buildCurrentPreview(
    input: AgentApprovedToolPreviewInput
  ): AgentApprovedToolPreviewResult | Promise<AgentApprovedToolPreviewResult>;
  executeApproved(
    input: AgentApprovedToolExecutionInput
  ): AgentApprovedToolExecutionResult | Promise<AgentApprovedToolExecutionResult>;
}

export interface AgentApprovedToolExecutionFailureInput {
  readonly category: AgentToolFailureCategory;
  readonly message: string;
  readonly retryable: boolean;
  readonly allowedActions: readonly string[];
}

export interface AgentApprovedToolExecutionFailure extends AgentApprovedToolExecutionFailureInput {
  readonly kind: typeof approvedToolExecutionFailureKind;
}

export function agentApprovedToolExecutionFailure(
  input: AgentApprovedToolExecutionFailureInput
): AgentApprovedToolExecutionFailure {
  return createAgentApprovedToolExecutionFailureFromRecord(input);
}

export function getAgentApprovedToolExecutionFailure(
  value: unknown
): AgentApprovedToolExecutionFailure | undefined {
  const record = dataRecordFromPlainObject(value);
  if (record === undefined || record.kind !== approvedToolExecutionFailureKind) {
    return undefined;
  }

  try {
    return createAgentApprovedToolExecutionFailureFromRecord(record);
  } catch {
    return undefined;
  }
}

function createAgentApprovedToolExecutionFailureFromRecord(input: unknown): AgentApprovedToolExecutionFailure {
  const record = dataRecordFromPlainObject(input);
  if (record === undefined) {
    throw new Error("approved tool execution failure must be a plain object.");
  }
  rejectUnsupportedKeys(
    record,
    ["kind", "category", "message", "retryable", "allowedActions"],
    "approved tool execution failure"
  );
  if (record.kind !== undefined && record.kind !== approvedToolExecutionFailureKind) {
    throw new Error("approved tool execution failure kind must be canonical.");
  }

  const category = parseFailureCategory(record.category);
  const message = assertNonEmptySecretSafeString(record.message, "approved tool execution failure message");
  if (typeof record.retryable !== "boolean") {
    throw new Error("approved tool execution failure retryable must be a boolean.");
  }
  const allowedActions = sanitizeStringList(
    record.allowedActions,
    "approved tool execution failure allowed action"
  );
  return Object.freeze({
    kind: approvedToolExecutionFailureKind,
    category,
    message,
    retryable: record.retryable,
    allowedActions
  });
}

function parseFailureCategory(value: unknown): AgentToolFailureCategory {
  const category = assertNonEmptySecretSafeString(value, "approved tool execution failure category");
  if (!agentToolFailureCategoryValues.includes(category as AgentToolFailureCategory)) {
    throw new Error("approved tool execution failure category must be canonical.");
  }
  return category as AgentToolFailureCategory;
}

function sanitizeStringList(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || Object.getOwnPropertySymbols(value).length > 0) {
    throw new Error(`${label} list must be an array.`);
  }

  const actions: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) {
      throw new Error(`${label} list must not contain sparse, hidden, or accessor-backed values.`);
    }
    actions.push(assertNonEmptySecretSafeString(descriptor.value, label));
  }

  for (const name of Object.getOwnPropertyNames(value)) {
    if (name !== "length" && !actions.some((_, index) => name === String(index))) {
      throw new Error(`${label} list must not contain custom array fields.`);
    }
  }
  return Object.freeze(actions);
}

function dataRecordFromPlainObject(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value) || !isPlainRecord(value)) {
    return undefined;
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    return undefined;
  }

  const record = Object.create(null) as Record<string, unknown>;
  for (const key of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) {
      return undefined;
    }
    record[key] = descriptor.value;
  }
  return record;
}

function rejectUnsupportedKeys(record: Record<string, unknown>, allowedKeys: readonly string[], label: string): void {
  const allowed = new Set(allowedKeys);
  if (Object.keys(record).some((key) => !allowed.has(key))) {
    throw new Error(`${label} contains unsupported fields.`);
  }
}

function assertNonEmptySecretSafeString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  assertAgentSecretSafeText(value, label);
  return value;
}

function isPlainRecord(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
