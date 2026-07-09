import { z } from "zod";
import type { AgentToolApprovalClass, AgentToolSideEffectClass } from "./projection-types.js";
import type { AgentToolPreview, AgentToolReadModelChange, AgentToolResult } from "./tool-gateway.js";

export const agentSchedulerItemStateSchema = z.enum(["not-ready", "blocked", "resumed", "completed", "failed"]);

export const agentSchedulerItemSummaryDtoSchema = z.object({
  toolRequestId: z.string().min(1),
  runId: z.string().min(1),
  taskId: z.string().min(1).optional(),
  toolId: z.string().min(1),
  toolVersion: z.string().min(1),
  state: agentSchedulerItemStateSchema,
  approvalClass: z.string().min(1),
  previewHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  currentPreviewHash: z.string().regex(/^sha256:[a-f0-9]{64}$/).optional(),
  category: z.string().min(1).optional(),
  message: z.string().min(1).optional(),
  eventIds: z.array(z.string().regex(/^evt_[a-zA-Z0-9_-]+$/)),
  allowedNextActions: z.array(z.string().min(1))
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
  allowedNextActions: z.array(z.string().min(1)),
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
