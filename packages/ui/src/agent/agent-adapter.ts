import { z } from "zod";
import { providerReadinessDtoSchema } from "../../../agent/src/provider-readiness.js";
import type {
  AgentApprovalCockpitDto,
  AgentApprovalDecisionResultDto,
  AgentRuntimeDiagnosticDto,
  AgentStatusDto,
  OntologyBootstrapRouteDto
} from "./agent-types.js";

export interface AgentAdapter {
  loadStatus(): Promise<AgentStatusDto>;
  loadApprovalCockpit(): Promise<AgentApprovalCockpitDto>;
  approveToolRequest(input: ApproveToolRequestInput): Promise<AgentApprovalDecisionResultDto>;
  denyToolRequest(input: DenyToolRequestInput): Promise<AgentApprovalDecisionResultDto>;
}

export interface HttpAgentAdapterOptions {
  readonly baseUrl?: string;
  readonly authToken?: string;
  readonly credentials?: RequestCredentials;
  readonly fetcher?: typeof fetch;
}

export interface ApproveToolRequestInput {
  readonly toolRequestId: string;
  readonly approvedPreviewHash: string;
  readonly rationale: string;
}

export interface DenyToolRequestInput {
  readonly toolRequestId: string;
  readonly rationale: string;
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
const sentinelApprovalIdentifiers = new Set(["none", "human-review"]);
const extensibleApprovalIdentifierSchema = z.string().min(1).refine(
  (value) => !sentinelApprovalIdentifiers.has(value),
  "Approval identifiers must not use sentinel values."
);
const extensibleApprovalClassSchema = extensibleApprovalIdentifierSchema;
const extensibleForbiddenDirectEffectSchema = extensibleApprovalIdentifierSchema;
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
  requiredApprovalClass: extensibleApprovalClassSchema,
  previewHash: z.string().min(1),
  scope: z.string().min(1),
  estimatedEffect: z.string().min(1),
  state: z.enum(["requested", "approved", "denied", "completed", "failed"]),
  requestedAt: z.string().datetime(),
  sourceEventIds: eventIdsSchema,
  inputArtifactHashes: z.array(z.string().min(1)),
  approvedBy: z.string().min(1).optional(),
  approvedPreviewHash: z.string().min(1).optional(),
  approvalClass: extensibleApprovalClassSchema.optional(),
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
  memoryKind: z.enum(["operator-preference", "agent-observation", "policy-caveat", "provider-note"]),
  summary: z.string().min(1),
  recordedBy: z.string().min(1),
  recordedByKind: z.enum(["human", "agent", "extractor", "system"]),
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

const contextPackRefSchema = z.object({
  contextPackId: z.string().min(1),
  version: z.number().int().positive(),
  contentHash: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  generatedAt: z.string().datetime(),
  safeSummary: z.string().min(1),
  provenanceRefs: z.array(z.string().min(1)).min(1),
  projectionHighWaterMark: z.number().int().nonnegative().optional()
}).strict();

const affectedRefSchema = z.object({
  kind: z.string().min(1),
  id: z.string().min(1),
  hash: z.string().min(1).optional(),
  label: z.string().min(1).optional()
}).strict();

const approvalQueueLockSchema = z.object({
  lockId: z.string().min(1),
  category: z.string().min(1),
  message: z.string().min(1),
  relatedRefs: z.array(affectedRefSchema).optional(),
  appliesToToolRequestIds: z.array(z.string().min(1)).optional(),
  appliesToApprovalClasses: z.array(extensibleApprovalClassSchema).optional()
}).strict();

const approvalQueueApprovalSchema = z.object({
  toolRequestId: z.string().min(1),
  approvedBy: z.string().min(1),
  approvedPreviewHash: z.string().min(1),
  approvedAt: z.string().datetime(),
  rationale: z.string().min(1),
  approvalClass: extensibleApprovalClassSchema.optional()
}).strict();

const approvalQueueDenialSchema = z.object({
  toolRequestId: z.string().min(1),
  deniedBy: z.string().min(1),
  deniedAt: z.string().datetime(),
  rationale: z.string().min(1),
  approvalClass: extensibleApprovalClassSchema.optional()
}).strict();

const approvalQueueCompletionSchema = z.object({
  toolRequestId: z.string().min(1),
  completedAt: z.string().datetime(),
  resultSummary: z.string().min(1).optional(),
  eventIds: z.array(z.string().min(1)),
  artifactHashes: z.array(z.string().min(1)),
  readModelChanges: z.array(z.string().min(1))
}).strict();

const approvalQueueFailureSchema = z.object({
  toolRequestId: z.string().min(1),
  failedAt: z.string().datetime(),
  category: z.string().min(1),
  message: z.string().min(1),
  retryable: z.boolean(),
  allowedActions: z.array(z.string().min(1))
}).strict();

const approvalQueueRiskSchema = z.object({
  sideEffectClass: z.string().min(1),
  approvalClass: extensibleApprovalClassSchema,
  previewSummary: z.string().min(1),
  affectedRefs: z.array(affectedRefSchema),
  contextPackRefs: z.array(contextPackRefSchema),
  activeLocks: z.array(approvalQueueLockSchema),
  blockingReasons: z.array(z.string().min(1))
}).strict();

const approvalStalenessSchema = z.object({
  state: z.enum(["current", "stale"]),
  approvable: z.boolean(),
  currentPreviewHash: z.string().min(1).optional(),
  guidance: z.string().min(1).optional()
}).strict();

const approvalContractSchema = z.object({
  requiredApprovalClass: extensibleApprovalClassSchema,
  approvalRouteAppendsOnly: z.literal(true),
  denialRouteAppendsOnly: z.literal(true),
  rationaleRequired: z.literal(true),
  rationaleSecretSafe: z.literal(true),
  afterApproval: z.string().min(1)
}).strict();

const approvalReviewSchema = z.object({
  what: z.string().min(1),
  why: z.string().min(1),
  dataLeavesOrChanges: z.string().min(1),
  evidenceRefs: z.array(affectedRefSchema),
  artifactRefs: z.array(affectedRefSchema),
  riskAndLockStatus: z.string().min(1),
  whatHappensAfterApproval: z.string().min(1),
  staleOrUnsafePrevention: z.array(z.string().min(1))
}).strict();

const agentApprovalQueueItemSchema = z.object({
  toolRequestId: z.string().min(1),
  runId: z.string().min(1),
  taskId: z.string().min(1),
  toolId: z.string().min(1),
  toolVersion: z.union([z.number(), z.string().min(1)]),
  sideEffectClass: z.string().min(1),
  approvalClass: extensibleApprovalClassSchema,
  requiredApprovalClass: extensibleApprovalClassSchema,
  previewHash: z.string().min(1),
  currentPreviewHash: z.string().min(1).optional(),
  previewSummary: z.string().min(1),
  requestedAt: z.string().datetime(),
  stale: z.boolean(),
  executableByApproval: z.literal(false),
  providerByteTransferNote: z.string().min(1).optional(),
  staleness: approvalStalenessSchema,
  approvalContract: approvalContractSchema,
  review: approvalReviewSchema,
  affectedRefs: z.array(affectedRefSchema),
  contextPackRefs: z.array(contextPackRefSchema),
  activeLocks: z.array(approvalQueueLockSchema),
  blockingReasons: z.array(z.string().min(1)),
  risk: approvalQueueRiskSchema,
  approval: approvalQueueApprovalSchema.optional(),
  denial: approvalQueueDenialSchema.optional(),
  completion: approvalQueueCompletionSchema.optional(),
  failure: approvalQueueFailureSchema.optional()
}).strict();

const agentApprovalCockpitDtoSchema = z.object({
  schemaVersion: z.literal("agent-approval-cockpit.v1"),
  generatedAt: z.string().datetime(),
  summary: z.object({
    pendingCount: z.number().int().nonnegative(),
    resumableCount: z.number().int().nonnegative(),
    blockedCount: z.number().int().nonnegative(),
    staleCount: z.number().int().nonnegative(),
    terminalCount: z.number().int().nonnegative()
  }).strict(),
  decisionContract: z.object({
    approvalAppendsDecisionOnly: z.literal(true),
    denialAppendsDecisionOnly: z.literal(true),
    requiresHumanActor: z.literal(true),
    afterApproval: z.string().min(1),
    forbiddenDirectEffects: z.array(extensibleForbiddenDirectEffectSchema)
  }).strict(),
  approvalClasses: z.array(z.object({
    approvalClass: extensibleApprovalClassSchema,
    label: z.string().min(1),
    requiredFor: z.string().min(1),
    providerByteTransferNote: z.string().min(1).optional(),
    rationale: z.object({
      required: z.literal(true),
      secretSafe: z.literal(true)
    }).strict()
  }).strict()),
  queue: z.object({
    generatedAt: z.string().datetime(),
    pending: z.array(agentApprovalQueueItemSchema),
    resumable: z.array(agentApprovalQueueItemSchema),
    blocked: z.array(agentApprovalQueueItemSchema),
    stale: z.array(agentApprovalQueueItemSchema),
    denied: z.array(agentApprovalQueueItemSchema),
    completed: z.array(agentApprovalQueueItemSchema),
    failed: z.array(agentApprovalQueueItemSchema)
  }).strict(),
  forbiddenDirectEffects: z.array(extensibleForbiddenDirectEffectSchema)
}).strict();

const agentApprovalDecisionResultDtoSchema = z.object({
  ok: z.literal(true),
  schemaVersion: z.literal("agent-approval-decision-result.v1"),
  eventIds: z.array(z.string().min(1)),
  approvalCockpit: agentApprovalCockpitDtoSchema
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

const contentHashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const ontologyBootstrapNextCursorSchema = z.object({
  currentOffset: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  totalCandidates: z.number().int().nonnegative(),
  nextOffset: z.number().int().nonnegative().optional()
}).strict();
const ontologyBootstrapNextSafeActionSchema = z.object({
  actionId: z.string().min(1).optional(),
  label: z.string().min(1),
  kind: z.enum(["read", "ask-operator", "request-tool", "review"]),
  effect: z.enum(["none", "local-derivative", "ledger-review", "ledger-proposal"])
}).strict();
const ontologyBootstrapRouteDtoSchema = z.object({
  schemaVersion: z.literal("agent-ontology-bootstrap-route.v1"),
  generatedAt: z.string().datetime(),
  runId: z.string().regex(/^run_[a-zA-Z0-9_-]+$/),
  taskId: z.string().regex(/^task_[a-zA-Z0-9_-]+$/).optional(),
  phase: z.enum([
    "report-required",
    "raw-import-review",
    "evidence-import",
    "dossier-review",
    "staging-review",
    "ready-to-stage",
    "completed",
    "blocked"
  ]).optional(),
  legacyReportId: z.string().regex(/^legacy_report_[a-zA-Z0-9_-]+$/).optional(),
  reportHash: contentHashSchema.optional(),
  candidateSetHash: contentHashSchema.optional(),
  reviewBundleHash: contentHashSchema.optional(),
  candidateBundleCount: z.number().int().nonnegative().optional(),
  candidateCount: z.number().int().nonnegative().optional(),
  selectedCandidateIds: z.array(z.string().regex(/^legacy_candidate_[a-zA-Z0-9_-]+$/)).default([]),
  blockedRequestedCandidateIds: z.array(z.string().regex(/^legacy_candidate_[a-zA-Z0-9_-]+$/)).default([]),
  pendingApprovalToolRequestIds: z.array(z.string().regex(/^toolreq_[a-zA-Z0-9_-]+$/)).default([]),
  nextCursor: ontologyBootstrapNextCursorSchema.optional(),
  nextSafeAction: ontologyBootstrapNextSafeActionSchema.optional(),
  runState: z.enum(["running", "completed", "failed"]).optional(),
  outputArtifactHashes: z.array(contentHashSchema).optional(),
  stepIds: z.array(z.string().min(1)).optional()
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
    },

    async loadApprovalCockpit() {
      const response = await fetchAgentRoute({
        path: `${baseUrl}/api/agent/approvals`,
        credentials,
        fetcher,
        ...(options.authToken === undefined ? {} : { authToken: options.authToken })
      });
      return agentApprovalCockpitFromJson(await readRouteJson(response, "Agent approval cockpit"));
    },

    async approveToolRequest(input: ApproveToolRequestInput) {
      const response = await fetchAgentRoute({
        path: `${baseUrl}/api/agent/approvals/${encodeURIComponent(input.toolRequestId)}/approve`,
        credentials,
        fetcher,
        ...(options.authToken === undefined ? {} : { authToken: options.authToken }),
        method: "POST",
        body: {
          approvedPreviewHash: input.approvedPreviewHash,
          rationale: input.rationale
        }
      });
      return agentApprovalDecisionResultFromJson(await readRouteJson(response, "Agent approval decision"));
    },

    async denyToolRequest(input: DenyToolRequestInput) {
      const response = await fetchAgentRoute({
        path: `${baseUrl}/api/agent/approvals/${encodeURIComponent(input.toolRequestId)}/deny`,
        credentials,
        fetcher,
        ...(options.authToken === undefined ? {} : { authToken: options.authToken }),
        method: "POST",
        body: {
          rationale: input.rationale
        }
      });
      return agentApprovalDecisionResultFromJson(await readRouteJson(response, "Agent approval decision"));
    }
  });
}

export const httpAgentAdapter = createHttpAgentAdapter();

export function createStaticAgentAdapter(
  dto: AgentStatusDto,
  approvalCockpit?: AgentApprovalCockpitDto
): AgentAdapter {
  const stored = agentStatusFromJson(dto);
  const storedApprovalCockpit = agentApprovalCockpitFromJson(
    approvalCockpit ?? emptyApprovalCockpit(stored.generatedAt)
  );

  return Object.freeze({
    async loadStatus() {
      return deepFreeze(deepClone(stored));
    },

    async loadApprovalCockpit() {
      return deepFreeze(deepClone(storedApprovalCockpit));
    },

    async approveToolRequest() {
      throw new Error("Static agent adapter cannot approve tool requests.");
    },

    async denyToolRequest() {
      throw new Error("Static agent adapter cannot deny tool requests.");
    }
  });
}

export function agentStatusFromJson(value: unknown): AgentStatusDto {
  return deepFreeze(agentStatusDtoSchema.parse(safeAgentValue(value)) as AgentStatusDto);
}

export function agentApprovalCockpitFromJson(value: unknown): AgentApprovalCockpitDto {
  return deepFreeze(agentApprovalCockpitDtoSchema.parse(safeAgentValue(value)) as AgentApprovalCockpitDto);
}

export function agentApprovalDecisionResultFromJson(value: unknown): AgentApprovalDecisionResultDto {
  return deepFreeze(
    agentApprovalDecisionResultDtoSchema.parse(safeAgentValue(value)) as AgentApprovalDecisionResultDto
  );
}

export function ontologyBootstrapRouteDtoFromJson(value: unknown): OntologyBootstrapRouteDto {
  return deepFreeze(ontologyBootstrapRouteDtoSchema.parse(safeAgentValue(value)) as OntologyBootstrapRouteDto);
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
  return redactNonUrlAbsolutePaths(
    text
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
    .replace(
      /(?<![-\w])(?:auth[\s._-]*tokens?|bearer(?:[\s._-]*tokens?)?|tokens?|passwords?|private[\s._-]*keys?)(?![-\w])/gi,
      "[redacted credential]"
    )
  );
}

function safeGeneratedAt(value: string | undefined): string {
  if (value === undefined) {
    return new Date().toISOString();
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? new Date().toISOString() : new Date(timestamp).toISOString();
}

function redactNonUrlAbsolutePaths(text: string): string {
  return text.replace(
    /(^|[\s("'=:\[])(\/(?:[^/\s"'`,;)\]]+(?:\/[^/\s"'`,;)\]]*)*))/g,
    (_match, prefix: string, path: string) => `${prefix}${path.startsWith("//") ? path : "[path redacted]"}`
  );
}

function authHeaders(authToken: string | undefined): Record<string, string> {
  return authToken === undefined ? {} : { authorization: `Bearer ${authToken}` };
}

async function fetchAgentRoute(input: {
  readonly path: string;
  readonly credentials: RequestCredentials;
  readonly fetcher: typeof fetch;
  readonly authToken?: string;
  readonly method?: "GET" | "POST";
  readonly body?: Record<string, string>;
}): Promise<Response> {
  try {
    return await input.fetcher(input.path, {
      credentials: input.credentials,
      headers: requestHeaders(input.authToken, input.body === undefined ? undefined : "application/json"),
      method: input.method ?? "GET",
      ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) })
    });
  } catch {
    throw new Error("Agent runtime request failed.");
  }
}

async function readRouteJson(response: Response, label: string): Promise<unknown> {
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new Error(response.ok ? `${label} route returned invalid JSON.` : `${label} route returned HTTP ${response.status}.`);
  }

  if (!response.ok) {
    throw new Error(safeAgentText(messageFromRuntimeFailure(json) ?? `${label} route returned HTTP ${response.status}.`));
  }

  return json;
}

function requestHeaders(
  authToken: string | undefined,
  contentType: string | undefined
): Record<string, string> {
  return {
    ...authHeaders(authToken),
    ...(contentType === undefined ? {} : { "content-type": contentType })
  };
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

function emptyApprovalCockpit(generatedAt: string): AgentApprovalCockpitDto {
  return agentApprovalCockpitFromJson({
    schemaVersion: "agent-approval-cockpit.v1",
    generatedAt: safeGeneratedAt(generatedAt),
    summary: {
      pendingCount: 0,
      resumableCount: 0,
      blockedCount: 0,
      staleCount: 0,
      terminalCount: 0
    },
    decisionContract: {
      approvalAppendsDecisionOnly: true,
      denialAppendsDecisionOnly: true,
      requiresHumanActor: true,
      afterApproval: "Approval records a human decision only. A separate scheduler revalidates the exact preview hash before work.",
      forbiddenDirectEffects: [
        "provider-byte-transfer",
        "prr-send-followup",
        "legal-escalation",
        "export-publication",
        "destructive-repair",
        "accepted-graph-review"
      ]
    },
    approvalClasses: [],
    queue: {
      generatedAt: safeGeneratedAt(generatedAt),
      pending: [],
      resumable: [],
      blocked: [],
      stale: [],
      denied: [],
      completed: [],
      failed: []
    },
    forbiddenDirectEffects: [
      "provider-byte-transfer",
      "prr-send-followup",
      "legal-escalation",
      "export-publication",
      "destructive-repair",
      "accepted-graph-review"
    ]
  });
}

function safeAgentValue(value: unknown): unknown {
  if (typeof value === "string") {
    return safeAgentText(value);
  }

  if (Array.isArray(value)) {
    return safeAgentArray(value);
  }

  if (!isJsonObject(value)) {
    return value;
  }

  return safeAgentObject(value);
}

function safeAgentArray(value: readonly unknown[]): unknown[] {
  if (Object.getPrototypeOf(value) !== Array.prototype) {
    throw invalidBrowserDtoError("Browser DTO input must use plain array prototypes.");
  }

  const descriptors = Object.getOwnPropertyDescriptors(value);
  assertNoAccessorDescriptors(
    descriptors,
    "Browser DTO input must not use accessor-backed array items."
  );
  const result: unknown[] = [];

  for (const key of Object.keys(value)) {
    const descriptor = descriptors[key];
    if (descriptor === undefined) {
      throw invalidBrowserDtoError("Browser DTO input must not use accessor-backed array items.");
    }

    const index = Number(key);
    if (!Number.isInteger(index) || index < 0) {
      throw invalidBrowserDtoError("Browser DTO arrays must use numeric item keys only.");
    }

    result[index] = safeAgentValue(descriptor.value);
  }

  return result;
}

function safeAgentObject(value: Record<string, unknown>): Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw invalidBrowserDtoError("Browser DTO input must use plain object prototypes.");
  }

  const descriptors = Object.getOwnPropertyDescriptors(value);
  assertNoAccessorDescriptors(
    descriptors,
    "Browser DTO input must not use accessor-backed fields."
  );
  const result: Record<string, unknown> = {};

  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!descriptor.enumerable) {
      continue;
    }

    result[safeAgentText(key)] = safeAgentValue(descriptor.value);
  }

  return result;
}

function assertNoAccessorDescriptors(
  descriptors: Readonly<Record<string, PropertyDescriptor>>,
  message: string
): void {
  for (const descriptor of Object.values(descriptors)) {
    if (!("value" in descriptor)) {
      throw invalidBrowserDtoError(message);
    }
  }
}

function invalidBrowserDtoError(message: string): Error {
  return new Error(message);
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
