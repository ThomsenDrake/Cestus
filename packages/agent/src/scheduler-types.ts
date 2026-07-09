import { z } from "zod";
import type { AgentToolApprovalClass, AgentToolSideEffectClass } from "./projection-types.js";
import { assertAgentSecretSafeText } from "./secret-safety.js";
import type { AgentToolPreview, AgentToolReadModelChange, AgentToolResult } from "./tool-gateway.js";

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
});

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
});

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
