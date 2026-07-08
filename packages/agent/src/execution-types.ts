import { z } from "zod";

export const agentExecutionStateSchema = z.enum([
  "created",
  "queued",
  "running",
  "waiting-for-approval",
  "approved-resumable",
  "blocked",
  "completed",
  "failed",
  "canceled"
]);

export const agentExecutionBlockedCategorySchema = z.enum([
  "approval-required",
  "approval-denied",
  "approval-stale",
  "provider-unavailable",
  "provider-rate-limited",
  "credential-missing",
  "credential-revoked",
  "model-output-invalid",
  "secret-detected",
  "permission-denied",
  "lock-active",
  "projection-lag",
  "context-budget-exceeded",
  "missing-provenance",
  "domain-gate-failed",
  "stale-source",
  "external-effect-failed",
  "data-loss-risk"
]);

export type AgentExecutionState = z.infer<typeof agentExecutionStateSchema>;
export type AgentExecutionBlockedCategory = z.infer<typeof agentExecutionBlockedCategorySchema>;

export interface AgentExecutionDiagnosticDto {
  readonly category: AgentExecutionBlockedCategory;
  readonly message: string;
  readonly retryable: boolean;
  readonly allowedRepairActions: readonly string[];
  readonly relatedEventIds: readonly string[];
  readonly artifactHashes: readonly string[];
}

const allowedTransitions = new Map<AgentExecutionState, ReadonlySet<AgentExecutionState>>([
  ["created", new Set(["queued", "canceled"])],
  ["queued", new Set(["running", "blocked", "canceled"])],
  ["running", new Set(["waiting-for-approval", "blocked", "completed", "failed", "canceled"])],
  ["waiting-for-approval", new Set(["approved-resumable", "blocked", "failed", "canceled"])],
  ["approved-resumable", new Set(["running", "blocked", "failed", "canceled"])],
  ["blocked", new Set(["queued", "canceled"])],
  ["completed", new Set()],
  ["failed", new Set(["queued", "canceled"])],
  ["canceled", new Set()]
]);

export function canAgentExecutionTransition(from: AgentExecutionState, to: AgentExecutionState): boolean {
  return allowedTransitions.get(from)?.has(to) ?? false;
}

export function assertAgentExecutionTransition(from: AgentExecutionState, to: AgentExecutionState): void {
  if (!canAgentExecutionTransition(from, to)) {
    throw new Error(`Invalid agent execution transition from ${from} to ${to}`);
  }
}
