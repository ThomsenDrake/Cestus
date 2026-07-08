import { z } from "zod";
import { providerReadinessDtoSchema } from "../../../agent/src/provider-readiness.js";
import type { AgentRuntimeDiagnosticDto, AgentStatusDto } from "./agent-types.js";

export interface AgentAdapter {
  loadStatus(): Promise<AgentStatusDto>;
}

export interface HttpAgentAdapterOptions {
  readonly baseUrl?: string;
  readonly authToken?: string;
  readonly credentials?: RequestCredentials;
  readonly fetcher?: typeof fetch;
}

const eventIdsSchema = z.array(z.string().min(1));
const optionalEventIdsSchema = eventIdsSchema.default([]);
const agentFailureCategorySchema = z.enum([
  "provider-unavailable",
  "credential-missing",
  "credential-revoked",
  "approval-required",
  "approval-stale",
  "permission-denied",
  "secret-detected",
  "legal-lock-active",
  "projection-lag",
  "provenance-missing",
  "model-output-invalid",
  "external-effect-failed"
]);
const agentToolApprovalClassSchema = z.enum([
  "none",
  "human-review",
  "provider-byte-transfer",
  "external-message-send",
  "export-or-publication",
  "destructive-or-repair",
  "legal-escalation",
  "ledger-review"
]);

const identitySchema = z.object({
  residentAgentId: z.string().min(1),
  workspaceId: z.string().min(1),
  label: z.string().min(1),
  policyId: z.string().min(1).optional(),
  initializedBy: z.string().min(1).optional(),
  allowedRunTypes: z.array(z.string().min(1)),
  memoryProjectionVersion: z.string().min(1).optional(),
  eventIds: eventIdsSchema,
  causationIds: eventIdsSchema
}).strict();

const providerSchema = z.object({
  providerId: z.string().min(1),
  label: z.string().min(1),
  adapterVersion: z.string().min(1),
  endpointKind: z.enum(["openai-api", "openai-compatible-api", "local-engine", "enterprise-gateway", "custom-adapter"]),
  modelFamilies: z.array(z.string().min(1)).min(1),
  credentialKinds: z.array(z.enum([
    "api-key-bearer",
    "workload-identity-token",
    "subscription-oauth",
    "device-code-oauth",
    "local-no-secret",
    "mtls-certificate",
    "enterprise-gateway"
  ])).min(1),
  supportsStructuredOutput: z.boolean(),
  supportsToolCalling: z.boolean(),
  safeDataNotes: z.string().min(1)
}).strict();

const taskSchema = z.object({
  taskId: z.string().min(1),
  residentAgentId: z.string().min(1),
  title: z.string().min(1),
  requestedBy: z.string().min(1),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  status: z.enum(["queued", "running", "waiting-for-approval", "blocked", "completed", "failed", "canceled"]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().optional(),
  description: z.string().min(1).optional(),
  sourceEventIds: eventIdsSchema,
  inputArtifactHashes: z.array(z.string().min(1)),
  changedBy: z.string().min(1).optional(),
  statusReason: z.string().min(1).optional(),
  runId: z.string().min(1).optional(),
  eventIds: eventIdsSchema,
  causationIds: eventIdsSchema
}).strict();

const runSchema = z.object({
  runId: z.string().min(1),
  residentAgentId: z.string().min(1),
  runType: z.enum([
    "ontology-bootstrap",
    "prr-negotiation",
    "evidence-triage",
    "timeline-builder",
    "contradiction-finder",
    "investigation-planner",
    "report-builder"
  ]),
  state: z.enum(["running", "completed", "failed"]),
  startedBy: z.string().min(1),
  startedAt: z.string().datetime(),
  taskId: z.string().min(1).optional(),
  workspaceId: z.string().min(1).optional(),
  investigationId: z.string().min(1).optional(),
  sourceEventIds: eventIdsSchema,
  inputArtifactHashes: z.array(z.string().min(1)),
  relatedEventIds: eventIdsSchema,
  outputArtifactHashes: z.array(z.string().min(1)),
  stepIds: z.array(z.string().min(1)),
  invocationIds: z.array(z.string().min(1)),
  toolRequestIds: z.array(z.string().min(1)),
  completedAt: z.string().datetime().optional(),
  failedAt: z.string().datetime().optional(),
  failureCategory: agentFailureCategorySchema.optional(),
  failureMessage: z.string().min(1).optional(),
  retryable: z.boolean().optional(),
  allowedActions: z.array(z.string().min(1)),
  summary: z.string().min(1).optional(),
  eventIds: eventIdsSchema,
  causationIds: eventIdsSchema
}).strict();

const readModelChangeSchema = z.object({
  projectionName: z.string().min(1),
  change: z.string().min(1),
  relatedIds: z.array(z.string().min(1)).optional()
}).strict();

const toolRequestSchema = z.object({
  toolRequestId: z.string().min(1),
  runId: z.string().min(1),
  toolId: z.string().min(1),
  toolVersion: z.string().min(1),
  requestedBy: z.string().min(1),
  sideEffectClass: z.enum([
    "read-only",
    "local-derivative",
    "ledger-proposal",
    "ledger-review",
    "external-byte-transfer",
    "external-message-send",
    "export-or-publication",
    "destructive-or-repair",
    "legal-escalation"
  ]),
  requiredApprovalClass: agentToolApprovalClassSchema,
  previewHash: z.string().min(1),
  scope: z.string().min(1),
  estimatedEffect: z.string().min(1),
  state: z.enum(["requested", "approved", "denied", "completed", "failed"]),
  requestedAt: z.string().datetime(),
  sourceEventIds: eventIdsSchema,
  inputArtifactHashes: z.array(z.string().min(1)),
  approvedBy: z.string().min(1).optional(),
  approvedPreviewHash: z.string().min(1).optional(),
  approvalClass: agentToolApprovalClassSchema.optional(),
  approvalRationale: z.string().min(1).optional(),
  approvedAt: z.string().datetime().optional(),
  deniedBy: z.string().min(1).optional(),
  denialRationale: z.string().min(1).optional(),
  deniedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  resultEventIds: eventIdsSchema,
  artifactHashes: z.array(z.string().min(1)),
  readModelChanges: z.array(readModelChangeSchema),
  resultSummary: z.string().min(1).optional(),
  failedAt: z.string().datetime().optional(),
  failureCategory: agentFailureCategorySchema.optional(),
  failureMessage: z.string().min(1).optional(),
  retryable: z.boolean().optional(),
  allowedActions: z.array(z.string().min(1)),
  eventIds: eventIdsSchema,
  causationIds: eventIdsSchema
}).strict();

const memorySchema = z.object({
  memoryId: z.string().min(1),
  residentAgentId: z.string().min(1),
  scope: z.enum(["workspace", "investigation", "task", "provider", "policy"]),
  summary: z.string().min(1),
  sourceEventIds: eventIdsSchema,
  artifactHashes: z.array(z.string().min(1)),
  confidence: z.number().min(0).max(1),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
  state: z.enum(["active", "superseded", "retracted"]),
  supersededByMemoryId: z.string().min(1).optional(),
  supersededBy: z.string().min(1).optional(),
  supersededAt: z.string().datetime().optional(),
  supersessionRationale: z.string().min(1).optional(),
  retractedBy: z.string().min(1).optional(),
  retractedAt: z.string().datetime().optional(),
  retractionRationale: z.string().min(1).optional(),
  eventIds: eventIdsSchema,
  causationIds: eventIdsSchema
}).strict();

const permissionSchema = z.object({
  permissionId: z.string().min(1),
  residentAgentId: z.string().min(1),
  grantedBy: z.string().min(1),
  scope: z.string().min(1),
  sideEffectClasses: z.array(toolRequestSchema.shape.sideEffectClass),
  rationale: z.string().min(1),
  grantedAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
  state: z.enum(["granted", "revoked"]),
  revokedBy: z.string().min(1).optional(),
  revokedAt: z.string().datetime().optional(),
  revocationRationale: z.string().min(1).optional(),
  eventIds: eventIdsSchema,
  causationIds: eventIdsSchema
}).strict();

const lockSchema = z.object({
  lockId: z.string().min(1),
  residentAgentId: z.string().min(1),
  kind: z.enum(["legal-escalation", "export", "secret", "governance", "data-loss", "provider-byte-transfer"]),
  activatedBy: z.string().min(1),
  reason: z.string().min(1),
  activatedAt: z.string().datetime(),
  relatedEventIds: eventIdsSchema,
  state: z.enum(["active", "cleared"]),
  clearedBy: z.string().min(1).optional(),
  clearedAt: z.string().datetime().optional(),
  clearRationale: z.string().min(1).optional(),
  clearRelatedEventIds: eventIdsSchema,
  eventIds: eventIdsSchema,
  causationIds: eventIdsSchema
}).strict();

const diagnosticSchema = z.object({
  diagnosticId: z.string().min(1).optional(),
  severity: z.enum(["info", "warning", "error"]),
  category: z.enum(["agent", "provider", "credential", "tool-gateway", "policy", "runtime"]),
  message: z.string().min(1),
  allowedRepairActions: z.array(z.string().min(1)).optional()
}).strict();

const agentStatusDtoSchema = z.object({
  schemaVersion: z.literal("agent-status.v1"),
  generatedAt: z.string().datetime(),
  residentAgentId: z.string().min(1).optional(),
  identity: identitySchema.optional(),
  tasks: z.array(taskSchema),
  runs: z.array(runSchema),
  toolRequests: z.array(toolRequestSchema),
  activeMemory: z.array(memorySchema),
  permissions: z.array(permissionSchema),
  locks: z.array(lockSchema),
  providers: z.array(providerSchema),
  providerReadiness: providerReadinessDtoSchema.optional(),
  pendingApprovalCount: z.number().int().nonnegative(),
  activeLockCount: z.number().int().nonnegative(),
  diagnostics: z.array(diagnosticSchema)
}).strict();

export function createHttpAgentAdapter(options: HttpAgentAdapterOptions = {}): AgentAdapter {
  const baseUrl = options.baseUrl ?? "";
  const credentials = options.credentials ?? "same-origin";
  const fetcher = options.fetcher ?? ((...args: Parameters<typeof fetch>) => globalThis.fetch(...args));

  return Object.freeze({
    async loadStatus() {
      let response: Response;
      try {
        response = await fetcher(`${baseUrl}/api/agent/status`, {
          credentials,
          headers: authHeaders(options.authToken),
          method: "GET"
        });
      } catch {
        return runtimeUnavailableAgentStatus({ message: "Agent runtime request failed." });
      }

      let json: unknown;
      try {
        json = await response.json();
      } catch {
        return runtimeUnavailableAgentStatus({
          message: response.ok ? "Agent runtime returned invalid JSON." : `Agent runtime returned HTTP ${response.status}.`
        });
      }

      if (!response.ok) {
        return runtimeUnavailableAgentStatus({
          message: messageFromRuntimeFailure(json) ?? `Agent runtime returned HTTP ${response.status}.`
        });
      }

      try {
        return agentStatusFromJson(json);
      } catch {
        return runtimeUnavailableAgentStatus({ message: "Agent runtime returned an invalid DTO." });
      }
    }
  });
}

export const httpAgentAdapter = createHttpAgentAdapter();

export function createStaticAgentAdapter(dto: AgentStatusDto): AgentAdapter {
  const stored = agentStatusFromJson(dto);

  return Object.freeze({
    async loadStatus() {
      return deepFreeze(deepClone(stored));
    }
  });
}

export function agentStatusFromJson(value: unknown): AgentStatusDto {
  return deepFreeze(agentStatusDtoSchema.parse(safeAgentValue(value)) as AgentStatusDto);
}

export function runtimeUnavailableAgentStatus(input: {
  readonly generatedAt?: string;
  readonly message?: string;
} = {}): AgentStatusDto {
  const message = safeAgentText(input.message ?? "Agent runtime is unavailable.");
  const diagnostic: AgentRuntimeDiagnosticDto = {
    diagnosticId: "diag_agent_runtime_unavailable",
    severity: "error",
    category: "runtime",
    message,
    allowedRepairActions: ["start the local runtime", "refresh agent status"]
  };

  return agentStatusFromJson({
    schemaVersion: "agent-status.v1",
    generatedAt: safeGeneratedAt(input.generatedAt),
    tasks: [],
    runs: [],
    toolRequests: [],
    activeMemory: [],
    permissions: [],
    locks: [],
    providers: [],
    pendingApprovalCount: 0,
    activeLockCount: 0,
    diagnostics: [diagnostic]
  });
}

export function safeAgentText(text: string): string {
  return text
    .replace(/bearer\s+[A-Za-z0-9._~+/=-]+/gi, "[redacted credential]")
    .replace(/sk[-_](?:live|test|proj)[-_][A-Za-z0-9_-]+/gi, "[redacted credential]")
    .replace(/(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]+/gi, "[redacted credential]")
    .replace(
      /\b(?=[A-Za-z0-9_]*_)(?=[A-Za-z0-9_]*(?:api_key|token|secret|password|credentials|private_key|client_secret|access_key_id))[A-Za-z0-9_]+\b/gi,
      "[redacted credential]"
    )
    .replace(
      /\b(?:password|passwd|secret|token|oauth[_-]?token|access[_-]?token|refresh[_-]?token|id[_-]?token|api[_-]?key|client[_-]?secret|credential|credentials)\s*[:=]\s*[^\s,;]+/gi,
      "[redacted credential]"
    )
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----/gi, "[redacted credential]")
    .replace(/-----END [^-]*PRIVATE KEY-----/gi, "[redacted credential]")
    .replace(/\b[A-Za-z]:\\[^\s"',;)]+/g, "[path redacted]")
    .replace(/(?<![:/])\/(?!\/)[^\s"',;)]+/g, "[path redacted]")
    .replace(
      /(?<![-\w])(?:auth[\s._-]*tokens?|bearer(?:[\s._-]*tokens?)?|tokens?|passwords?|private[\s._-]*keys?)(?![-\w])/gi,
      "[redacted credential]"
    );
}

function safeGeneratedAt(value: string | undefined): string {
  if (value === undefined) {
    return new Date().toISOString();
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? new Date().toISOString() : new Date(timestamp).toISOString();
}

function authHeaders(authToken: string | undefined): Record<string, string> {
  return authToken === undefined ? {} : { authorization: `Bearer ${authToken}` };
}

function messageFromRuntimeFailure(value: unknown): string | undefined {
  if (!isJsonObject(value)) {
    return undefined;
  }

  if (typeof value.message === "string") {
    return value.message;
  }

  if (isJsonObject(value.error) && typeof value.error.message === "string") {
    return value.error.message;
  }

  return undefined;
}

function safeAgentValue(value: unknown): unknown {
  if (typeof value === "string") {
    return safeAgentText(value);
  }

  if (Array.isArray(value)) {
    return value.map(safeAgentValue);
  }

  if (!isJsonObject(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [safeAgentText(key), safeAgentValue(nested)])
  );
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }

  for (const nested of Object.values(value)) {
    deepFreeze(nested);
  }

  return Object.freeze(value);
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
