import { z } from "zod";

export const operatorStatusSchemaVersion = "operator-status.v1" as const;
export const operatorReadinessStates = ["ready", "degraded", "action-required", "blocked", "unavailable"] as const;
export const operatorSectionIds = ["workspace", "ingestion", "legacy-import", "prr", "agent"] as const;
export const operatorSafeActionKinds = ["navigate", "refresh-status", "show-command", "open-doc"] as const;
export const operatorNavigationTargets = ["command", "requests", "ingestion", "evidence", "ontology", "settings", "agents"] as const;

const secretTextPattern =
  /(?:^|[^a-z0-9])(?:access[\s._-]*tokens?|api[\s._-]*keys?|auth[\s._-]*tokens?|authorization|bearer|tokens?|passwords?|private[\s._-]*keys?|client[\s._-]*secrets?|refresh[\s._-]*secrets?|session[\s._-]*secrets?|oauth|credentials?)(?:\s*[:=]\s*|\s+)(?=[a-z0-9._~+/=-]{3,})[a-z0-9][a-z0-9._~+/=-]*/i;
const secretPhrasePattern = /\b(?:auth[\s._-]*tokens?|bearer(?:[\s._-]*tokens?)?|passwords?|private[\s._-]*keys?)\b/i;
const privateKeyBlockPattern = /-----BEGIN [A-Z ]*PRIVATE KEY-----/i;

function isSecretSafeOperatorText(value: string): boolean {
  return !secretTextPattern.test(value) && !secretPhrasePattern.test(value) && !privateKeyBlockPattern.test(value);
}

const operatorSecretSafeTextSchema = z.string().min(1).refine(isSecretSafeOperatorText, {
  message: "operator status text must be secret-safe"
});

const operatorIdentifierSchema = z.string()
  .regex(/^[a-z][a-z0-9_-]*$/i)
  .refine(isSecretSafeOperatorText, { message: "operator status identifiers must be secret-safe" });
const operatorActionIdSchema = z.string()
  .regex(/^action_[a-zA-Z0-9_-]+$/)
  .refine(isSecretSafeOperatorText, { message: "operator status action ids must be secret-safe" });
const operatorDiagnosticIdSchema = z.string()
  .regex(/^diag_[a-zA-Z0-9_-]+$/)
  .refine(isSecretSafeOperatorText, { message: "operator status diagnostic ids must be secret-safe" });

const operatorReadinessStateSchema = z.enum(operatorReadinessStates);
const operatorSectionIdSchema = z.enum(operatorSectionIds);
const forbiddenCommandPatterns = [
  /\bprr\s+send\b/i,
  /\b(public[-\s]*records?\s+request|request)\s+send\b/i,
  /\blegal\s+escalat(?:e|ion)\b/i,
  /\bprojection\s+rebuild\b(?!-readiness)/i,
  /\b(?:register-source|approve-import|approve-provider)\b/i,
  /\b(?:cestus(?:-ingest)?|cestus-ingest\.mjs|ingest)\b.*\b(?:dry-run|import|retry)\b/i,
  /\b(?:repair|restore|delete|reset|destroy)\b.*\b(?:ledger|blob|workspace|ontology|canonical)\b/i,
  /\b(?:ledger|blob|workspace|ontology|canonical)\b.*\b(?:repair|restore|delete|reset|destroy)\b/i,
  /\b(?:provider|document[-\s]*ai|mistral)\b.*\b(?:parse|send|transfer|upload)\b/i,
  /\b(?:parse|send|transfer|upload)\b.*\b(?:provider|document[-\s]*ai|mistral)\b/i,
  /\b(?:accept|approve)\b.*\b(?:legacy|ontology|assertion|truth)\b/i,
  /\b(?:legacy|ontology|assertion|truth)\b.*\b(?:accept|approve)\b/i,
  /\bcestus(?:-ingest)?\s+(?:ingest\s+)?(?:approve-import|import)\b/i,
  /\bcestus\s+agent\s+(?:(?:approve|deny|execute|invoke|send|export)(?:[-\s][a-z0-9_-]+)?|provider[-\s]?transfer|transfer[-\s]?provider)\b/i,
  /\bagent\s+tool\b.*\b(?:approve|deny|execute|run|invoke)\b/i,
  /\b(?:approve|deny|execute|run|invoke)\b.*\bagent\s+tool\b/i,
  /\bagent\b.*\bprovider\b.*\b(?:invoke|run|execute|send|transfer|upload)\b/i,
  /\b(?:invoke|run|execute|send|transfer|upload)\b.*\bagent\b.*\bprovider\b/i
] as const;

export const operatorMetricSchema = z.object({
  metricId: operatorIdentifierSchema,
  label: operatorSecretSafeTextSchema,
  value: operatorSecretSafeTextSchema,
  tone: z.enum(["neutral", "healthy", "attention", "danger", "machine"])
}).strict();

const operatorJsonRefValueSchema = z.union([
  operatorSecretSafeTextSchema,
  z.number().finite(),
  z.boolean(),
  z.null()
]);

const operatorRefSchema = z.object({
  label: operatorSecretSafeTextSchema,
  value: operatorJsonRefValueSchema
}).strict();

export const operatorSafeActionSchema = z.object({
  actionId: operatorActionIdSchema,
  label: operatorSecretSafeTextSchema,
  kind: z.enum(operatorSafeActionKinds),
  target: z.enum(operatorNavigationTargets).optional(),
  command: operatorSecretSafeTextSchema.optional(),
  sourceContract: operatorSecretSafeTextSchema,
  requiresHumanApproval: z.boolean(),
  mutatesCanonicalState: z.literal(false),
  externalEffect: z.literal(false),
  enabled: z.boolean(),
  disabledReason: operatorSecretSafeTextSchema.optional()
}).strict().superRefine((action, ctx) => {
  if (action.kind === "navigate" && action.target === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["target"],
      message: "navigate actions require a target"
    });
  }

  if (action.kind === "show-command" && action.command === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["command"],
      message: "show-command actions require command text"
    });
  }

  if (
    action.kind === "show-command" &&
    action.command !== undefined &&
    forbiddenCommandPatterns.some((pattern) => pattern.test(action.command ?? ""))
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["command"],
      message: "show-command actions must not contain forbidden irreversible command text"
    });
  }
});

export const operatorDiagnosticSchema = z.object({
  diagnosticId: operatorDiagnosticIdSchema,
  severity: z.enum(["info", "warning", "error"]),
  category: z.enum(["workspace", "ingestion", "legacy-import", "prr", "agent", "runtime", "operator-status", "security"]),
  message: operatorSecretSafeTextSchema,
  refs: z.array(operatorRefSchema).default([])
}).strict();

export const operatorSourceEvidenceSchema = z.object({
  evidenceId: operatorIdentifierSchema,
  sourceContract: operatorSecretSafeTextSchema,
  sourceKind: z.enum(["workspace-ops", "ingestion", "legacy-import", "prr", "agent", "local-runtime", "ontology", "operator-status"]),
  label: operatorSecretSafeTextSchema,
  refs: z.array(operatorRefSchema).default([])
}).strict();

export const operatorStatusSectionSchema = z.object({
  sectionId: operatorSectionIdSchema,
  label: operatorSecretSafeTextSchema,
  state: operatorReadinessStateSchema,
  headline: operatorSecretSafeTextSchema,
  safeSummary: operatorSecretSafeTextSchema,
  metrics: z.array(operatorMetricSchema).default([]),
  diagnostics: z.array(operatorDiagnosticSchema).default([]),
  sourceEvidence: z.array(operatorSourceEvidenceSchema).default([]),
  nextSafeActionIds: z.array(operatorActionIdSchema).default([])
}).strict();

const operatorRuntimeSchema = z.object({
  available: z.boolean(),
  storageStrategy: operatorSecretSafeTextSchema.optional(),
  bindMode: operatorSecretSafeTextSchema.optional(),
  workspaceMounted: z.boolean().optional(),
  safeMessage: operatorSecretSafeTextSchema
}).strict();

const operatorStatusSummarySchema = z.object({
  overallState: operatorReadinessStateSchema,
  blockedCount: z.number().int().nonnegative(),
  actionRequiredCount: z.number().int().nonnegative(),
  degradedCount: z.number().int().nonnegative(),
  nextSafeActionId: operatorActionIdSchema.optional()
}).strict();

export const operatorStatusDtoSchema = z.object({
  schemaVersion: z.literal(operatorStatusSchemaVersion),
  generatedAt: z.string().datetime(),
  runtime: operatorRuntimeSchema,
  summary: operatorStatusSummarySchema,
  sections: z.array(operatorStatusSectionSchema).min(1),
  safeActions: z.array(operatorSafeActionSchema)
}).strict();

export type OperatorReadinessState = z.infer<typeof operatorReadinessStateSchema>;
export type OperatorStatusDto = z.infer<typeof operatorStatusDtoSchema>;
export type OperatorStatusSectionDto = z.infer<typeof operatorStatusSectionSchema>;
export type OperatorSafeActionDto = z.infer<typeof operatorSafeActionSchema>;
export type OperatorDiagnosticDto = z.infer<typeof operatorDiagnosticSchema>;
export type OperatorSourceEvidenceDto = z.infer<typeof operatorSourceEvidenceSchema>;

export function buildOperatorStatusSummary(
  sections: readonly Pick<OperatorStatusSectionDto, "sectionId" | "state" | "nextSafeActionIds">[]
): OperatorStatusDto["summary"] {
  const blocked = sections.filter((section) => section.state === "blocked");
  const actionRequired = sections.filter((section) => section.state === "action-required");
  const degraded = sections.filter((section) => section.state === "degraded");
  const nextSafeActionId =
    blocked[0]?.nextSafeActionIds[0] ??
    actionRequired[0]?.nextSafeActionIds[0] ??
    degraded[0]?.nextSafeActionIds[0];

  return {
    overallState: blocked.length > 0
      ? "blocked"
      : actionRequired.length > 0
        ? "action-required"
        : degraded.length > 0
          ? "degraded"
          : sections.every((section) => section.state === "unavailable")
            ? "unavailable"
            : "ready",
    blockedCount: blocked.length,
    actionRequiredCount: actionRequired.length,
    degradedCount: degraded.length,
    ...(nextSafeActionId === undefined ? {} : { nextSafeActionId })
  };
}
