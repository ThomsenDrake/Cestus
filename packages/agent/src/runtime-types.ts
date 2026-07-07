import type { AgentProjectionIdentity } from "./projection.js";
import type { AgentProjectionDto } from "./projection-types.js";
import type { ProviderDescriptor } from "./provider.js";

export interface AgentRuntimeDiagnosticDto {
  readonly diagnosticId?: string;
  readonly severity: "info" | "warning" | "error";
  readonly category: "agent" | "provider" | "credential" | "tool-gateway" | "policy" | "runtime";
  readonly message: string;
  readonly allowedRepairActions?: readonly string[];
}

export interface AgentStatusDto extends AgentProjectionDto {
  readonly schemaVersion: "agent-status.v1";
  readonly generatedAt: string;
  readonly identity?: AgentProjectionIdentity | undefined;
  readonly providers: readonly ProviderDescriptor[];
  readonly pendingApprovalCount: number;
  readonly activeLockCount: number;
  readonly diagnostics: readonly AgentRuntimeDiagnosticDto[];
}

export type AgentRuntimeResult<T> =
  | ({ readonly ok: true } & T)
  | { readonly ok: false; readonly error: AgentRuntimeDiagnosticDto };
