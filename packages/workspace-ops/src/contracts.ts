import { z } from "zod";

export const workspaceOpsPackageName = "@cestus/workspace-ops";
export const workspaceOpsSchemaVersion = "workspace-ops.v1" as const;

const secretTextPattern =
  /(?:^|[^a-z0-9])(?:access[\s._-]*token|api[\s._-]*key|authorization|bearer|token|password|private[\s._-]*key|client[\s._-]*secret|refresh[\s._-]*secret|session[\s._-]*secret|oauth|credential)(?:\s*[:=]\s*|\s+)(?=[a-z0-9._~+/=-]{3,})[a-z0-9][a-z0-9._~+/=-]*/i;

const unsafePayloadKeyNames = new Set(["__proto__", "constructor", "prototype"]);
const secretPayloadKeyTerms = new Set([
  "authorization",
  "bearer",
  "credential",
  "credentials",
  "oauth",
  "password",
  "token"
]);
const secretPayloadKeyCompounds = new Set([
  "accesstoken",
  "apikey",
  "clientsecret",
  "privatekey",
  "refreshsecret",
  "sessionsecret"
]);
const secretPayloadKeyPairs = [
  ["access", "token"],
  ["api", "key"],
  ["client", "secret"],
  ["private", "key"],
  ["refresh", "secret"],
  ["session", "secret"]
] as const;

export function isSecretSafeWorkspaceText(value: string): boolean {
  return !secretTextPattern.test(value);
}

export const secretSafeWorkspaceTextSchema = z.string().min(1).refine(isSecretSafeWorkspaceText, {
  message: "workspace ops text must not contain secrets"
});

function splitWorkspacePayloadKey(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((part) => part.length > 0);
}

function isSecretSafeWorkspacePayloadKey(value: string): boolean {
  if (!isSecretSafeWorkspaceText(value)) {
    return false;
  }

  const parts = splitWorkspacePayloadKey(value);
  if (parts.some((part) => secretPayloadKeyTerms.has(part))) {
    return false;
  }

  const compact = parts.join("");
  if (secretPayloadKeyCompounds.has(compact)) {
    return false;
  }

  return !secretPayloadKeyPairs.some(([first, second]) =>
    parts.some((part, index) => part === first && parts[index + 1] === second)
  );
}

function isSecretSafeWorkspaceIdentifier(value: string): boolean {
  return isSecretSafeWorkspacePayloadKey(value);
}

export const secretSafeWorkspaceIdentifierSchema = z.string().min(1).refine(isSecretSafeWorkspaceIdentifier, {
  message: "workspace ops identifiers must not contain secrets"
});

function workspaceIdentifierSchema(pattern: RegExp) {
  return z.string().regex(pattern).refine(isSecretSafeWorkspaceIdentifier, {
    message: "workspace ops identifiers must not contain secrets"
  });
}

const workspaceDiagnosticIdSchema = workspaceIdentifierSchema(/^diag_[a-zA-Z0-9_-]+$/);
const workspaceActionIdSchema = workspaceIdentifierSchema(/^(repair|action)_[a-zA-Z0-9_-]+$/);
const workspaceIdSchema = workspaceIdentifierSchema(/^ws_[a-zA-Z0-9_-]+$/);

type WorkspaceJsonPayload =
  | null
  | string
  | number
  | boolean
  | WorkspaceJsonPayload[]
  | { [key: string]: WorkspaceJsonPayload };

type PayloadValidationResult =
  | { readonly ok: true; readonly value: WorkspaceJsonPayload }
  | { readonly ok: false; readonly path: Array<string | number>; readonly message: string };

function normalizeWorkspacePayload(
  value: unknown,
  path: Array<string | number> = [],
  seen = new WeakSet<object>()
): PayloadValidationResult {
  if (value === null || typeof value === "boolean") {
    return { ok: true, value };
  }

  if (typeof value === "string") {
    return isSecretSafeWorkspaceText(value)
      ? { ok: true, value }
      : { ok: false, path, message: "workspace ops payload must not contain secrets" };
  }

  if (typeof value === "number") {
    return Number.isFinite(value)
      ? { ok: true, value }
      : { ok: false, path, message: "workspace ops payload numbers must be finite" };
  }

  if (typeof value !== "object") {
    return {
      ok: false,
      path,
      message: "workspace ops payload must contain only JSON DTO-safe values"
    };
  }

  if (seen.has(value)) {
    return { ok: false, path, message: "workspace ops payload must not contain cycles" };
  }
  seen.add(value);

  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype || "toJSON" in value) {
        return {
          ok: false,
          path,
          message: "workspace ops payload arrays must be JSON DTO-safe arrays"
        };
      }

      const ownKeys = Reflect.ownKeys(value);
      for (const key of ownKeys) {
        if (key === "length") {
          continue;
        }

        if (typeof key === "symbol") {
          return {
            ok: false,
            path,
            message: "workspace ops payload arrays must not contain symbol keys"
          };
        }

        if (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length) {
          return {
            ok: false,
            path,
            message: "workspace ops payload arrays must not contain custom properties"
          };
        }
      }

      const normalized: WorkspaceJsonPayload[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, index);
        if (descriptor === undefined) {
          return {
            ok: false,
            path: [...path, index],
            message: "workspace ops payload arrays must not contain sparse entries"
          };
        }

        if (!descriptor.enumerable) {
          return {
            ok: false,
            path: [...path, index],
            message: "workspace ops payload arrays must contain only enumerable entries"
          };
        }

        if (!("value" in descriptor)) {
          return {
            ok: false,
            path: [...path, index],
            message: "workspace ops payload arrays must not contain accessors"
          };
        }

        const result = normalizeWorkspacePayload(descriptor.value, [...path, index], seen);
        if (!result.ok) {
          return result;
        }
        normalized.push(result.value);
      }
      return { ok: true, value: normalized };
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return {
        ok: false,
        path,
        message: "workspace ops payload objects must be plain JSON DTO records"
      };
    }

    if ("toJSON" in value) {
      return {
        ok: false,
        path,
        message: "workspace ops payload objects must not define custom serializers"
      };
    }

    const descriptors = Object.getOwnPropertyDescriptors(value);
    const normalized: { [key: string]: WorkspaceJsonPayload } = {};
    for (const key of Reflect.ownKeys(descriptors)) {
      if (typeof key === "symbol") {
        return {
          ok: false,
          path,
          message: "workspace ops payload records must not contain symbol keys"
        };
      }

      const descriptor = descriptors[key];
      if (descriptor === undefined) {
        return {
          ok: false,
          path,
          message: "workspace ops payload records must contain valid field descriptors"
        };
      }

      if (key === "toJSON") {
        return {
          ok: false,
          path,
          message: "workspace ops payload objects must not define custom serializers"
        };
      }

      if (unsafePayloadKeyNames.has(key)) {
        return {
          ok: false,
          path: [...path, key],
          message: "workspace ops payload keys must not use prototype-pollution names"
        };
      }

      if (!isSecretSafeWorkspacePayloadKey(key)) {
        return {
          ok: false,
          path: [...path, key],
          message: "workspace ops payload keys must not contain secrets"
        };
      }

      if (!descriptor.enumerable) {
        return {
          ok: false,
          path: [...path, key],
          message: "workspace ops payload records must contain only enumerable fields"
        };
      }

      if (!("value" in descriptor)) {
        return {
          ok: false,
          path: [...path, key],
          message: "workspace ops payload records must not contain accessors"
        };
      }

      const result = normalizeWorkspacePayload(descriptor.value, [...path, key], seen);
      if (!result.ok) {
        return result;
      }
      Object.defineProperty(normalized, key, {
        value: result.value,
        enumerable: true,
        writable: true,
        configurable: true
      });
    }

    return { ok: true, value: normalized };
  } finally {
    seen.delete(value);
  }
}

const workspaceDtoJsonSchema = z.unknown().transform((value, ctx) => {
  const result = normalizeWorkspacePayload(value);
  if (!result.ok) {
    ctx.addIssue({
      code: "custom",
      path: result.path,
      message: result.message
    });
    return z.NEVER;
  }

  return result.value;
});
const workspacePayloadSchema = workspaceDtoJsonSchema;
const workspaceEnvelopeInputSchema = z.unknown().transform((value, ctx): unknown => {
  const result = normalizeWorkspacePayload(value);
  if (!result.ok) {
    ctx.addIssue({
      code: "custom",
      path: result.path,
      message: result.message
    });
    return z.NEVER;
  }

  return result.value;
});

export const workspaceOpsStatusSchema = z.enum(["ready", "degraded", "blocked"]);
export type WorkspaceOpsStatus = z.infer<typeof workspaceOpsStatusSchema>;

export const workspaceCommandSchema = z.enum([
  "verify workspace",
  "disk usage",
  "detect drive",
  "projection rebuild-readiness",
  "projection rebuild",
  "diagnostics inspect",
  "manifest export",
  "backup check"
]);
export type WorkspaceOpsCommand = z.infer<typeof workspaceCommandSchema>;

export const workspaceDiagnosticSchema = z.object({
  diagnosticId: workspaceDiagnosticIdSchema,
  severity: z.enum(["info", "warning", "error"]),
  category: z.enum([
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
  ]),
  message: secretSafeWorkspaceTextSchema,
  durable: z.boolean(),
  relatedIds: z.array(secretSafeWorkspaceIdentifierSchema).default([]),
  repairHint: z.object({
    allowedNextCommands: z.array(workspaceCommandSchema).min(1),
    requiresHumanApproval: z.boolean()
  }).strict()
}).strict();
export type WorkspaceDiagnosticDto = z.output<typeof workspaceDiagnosticSchema>;
export type WorkspaceDiagnosticInput = z.input<typeof workspaceDiagnosticSchema>;

export const proposedRepairActionSchema = z.object({
  actionId: workspaceActionIdSchema,
  kind: z.enum([
    "remount-drive",
    "select-workspace",
    "rerun-verify",
    "rebuild-projection",
    "export-manifest",
    "append-repair-event-required"
  ]),
  title: secretSafeWorkspaceTextSchema,
  severity: z.enum(["info", "warning", "error"]),
  requiresHumanApproval: z.boolean(),
  mutatesCanonicalState: z.boolean(),
  allowedNextCommands: z.array(workspaceCommandSchema).min(1)
}).strict().superRefine((action, ctx) => {
  if (action.mutatesCanonicalState && !action.requiresHumanApproval) {
    ctx.addIssue({
      code: "custom",
      path: ["requiresHumanApproval"],
      message: "canonical repair actions require human approval"
    });
  }

  if (
    action.kind === "append-repair-event-required" &&
    (!action.requiresHumanApproval || !action.mutatesCanonicalState)
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["kind"],
      message: "append-only canonical repair events require human approval"
    });
  }
});
export type ProposedRepairActionDto = z.output<typeof proposedRepairActionSchema>;
export type ProposedRepairActionInput = z.input<typeof proposedRepairActionSchema>;

export const workspaceRefSchema = z.object({
  workspaceId: workspaceIdSchema,
  label: secretSafeWorkspaceTextSchema,
  manifestVersion: z.number().int().positive(),
  rootUri: secretSafeWorkspaceTextSchema,
  layoutContractVersion: secretSafeWorkspaceTextSchema
}).strict();
export type WorkspaceRefDto = z.output<typeof workspaceRefSchema>;

export const workspaceNextCommandHintSchema = z.object({
  allowedNextCommands: z.array(workspaceCommandSchema).min(1),
  safeReason: secretSafeWorkspaceTextSchema,
  requiresHumanApproval: z.boolean()
}).strict();
export type WorkspaceNextCommandHintDto = z.output<typeof workspaceNextCommandHintSchema>;

export const mountStatusSchema = z.object({
  status: z.enum(["available", "missing", "unmounted", "wrong-drive", "unreadable"]),
  safeMessage: secretSafeWorkspaceTextSchema,
  expectedRootUri: secretSafeWorkspaceTextSchema.optional(),
  nextCommandHints: z.array(workspaceNextCommandHintSchema).min(1)
}).strict();
export type MountStatusDto = z.output<typeof mountStatusSchema>;

const sha256HashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const workspaceRootCategorySchema = z.enum([
  "manifest",
  "ledger",
  "blobs",
  "derivatives",
  "jobs",
  "projections",
  "diagnostics",
  "backups"
]);
const workspaceManifestSectionSchema = z.enum([
  "workspace",
  "manifest",
  "layout",
  "ledger",
  "blobs",
  "derivatives",
  "projections",
  "diagnostics",
  "jobs",
  "backup"
]);
const workspaceReadinessCheckSchema = z.object({
  checkId: secretSafeWorkspaceIdentifierSchema,
  status: z.enum(["pass", "warning", "fail"]),
  safeMessage: secretSafeWorkspaceTextSchema
}).strict();

export const workspaceVerifyDtoSchema = z.object({
  schemaVersion: z.literal(workspaceOpsSchemaVersion),
  mountStatus: mountStatusSchema,
  manifest: z.object({
    readable: z.boolean(),
    valid: z.boolean(),
    manifestVersion: z.number().int().positive().optional(),
    safeSummary: secretSafeWorkspaceTextSchema
  }).strict(),
  layout: z.object({
    contractVersion: secretSafeWorkspaceTextSchema,
    readable: z.boolean(),
    requiredRoots: z.array(z.object({
      rootId: secretSafeWorkspaceIdentifierSchema,
      category: workspaceRootCategorySchema,
      status: z.enum(["available", "missing", "unreadable"]),
      safeUri: secretSafeWorkspaceTextSchema.optional()
    }).strict())
  }).strict(),
  ledger: z.object({
    readable: z.boolean(),
    eventCount: z.number().int().nonnegative(),
    highWaterMark: z.number().int().nonnegative()
  }).strict(),
  blobStore: z.object({
    available: z.boolean(),
    contentAddressedRootCount: z.number().int().nonnegative(),
    aggregateBytes: z.number().int().nonnegative(),
    missingBlobCount: z.number().int().nonnegative(),
    hashMismatchCount: z.number().int().nonnegative()
  }).strict(),
  projections: z.object({
    available: z.boolean(),
    staleCount: z.number().int().nonnegative(),
    rebuildable: z.boolean()
  }).strict(),
  jobs: z.object({
    available: z.boolean(),
    queuedCount: z.number().int().nonnegative(),
    failedCount: z.number().int().nonnegative()
  }).strict(),
  diagnostics: z.object({
    visible: z.boolean(),
    errorCount: z.number().int().nonnegative(),
    warningCount: z.number().int().nonnegative()
  }).strict(),
  backup: z.object({
    manifestAvailable: z.boolean(),
    latestManifestHash: sha256HashSchema.optional(),
    stale: z.boolean()
  }).strict()
}).strict();
export type WorkspaceVerifyDto = z.output<typeof workspaceVerifyDtoSchema>;

export const diskUsageDtoSchema = z.object({
  schemaVersion: z.literal(workspaceOpsSchemaVersion),
  estimatedFreeBytes: z.number().int().nonnegative().optional(),
  thresholdWarnings: z.array(secretSafeWorkspaceTextSchema),
  roots: z.array(z.object({
    rootId: secretSafeWorkspaceIdentifierSchema,
    category: workspaceRootCategorySchema,
    bytes: z.number().int().nonnegative(),
    exists: z.boolean(),
    safeUri: secretSafeWorkspaceTextSchema.optional()
  }).strict()),
  categories: z.array(z.object({
    category: workspaceRootCategorySchema,
    bytes: z.number().int().nonnegative(),
    exists: z.boolean()
  }).strict()),
  totalBytes: z.number().int().nonnegative()
}).strict();
export type DiskUsageDto = z.output<typeof diskUsageDtoSchema>;

export const projectionRebuildDtoSchema = z.object({
  schemaVersion: z.literal(workspaceOpsSchemaVersion),
  mode: z.enum(["readiness", "result"]),
  requestedProjections: z.array(secretSafeWorkspaceTextSchema).min(1),
  inputLedger: z.object({
    readable: z.boolean(),
    eventCount: z.number().int().nonnegative(),
    highWaterMark: z.number().int().nonnegative()
  }).strict(),
  readiness: z.object({
    ready: z.boolean(),
    checks: z.array(workspaceReadinessCheckSchema)
  }).strict(),
  artifactOutputs: z.array(z.object({
    projectionName: secretSafeWorkspaceTextSchema,
    artifactId: secretSafeWorkspaceIdentifierSchema,
    artifactHash: sha256HashSchema.optional(),
    byteCount: z.number().int().nonnegative(),
    expendable: z.literal(true)
  }).strict()),
  validationResults: z.array(z.object({
    validationId: secretSafeWorkspaceIdentifierSchema,
    status: z.enum(["pass", "warning", "fail"]),
    safeMessage: secretSafeWorkspaceTextSchema
  }).strict()),
  failures: z.array(z.object({
    failureId: secretSafeWorkspaceIdentifierSchema,
    safeMessage: secretSafeWorkspaceTextSchema,
    retryable: z.boolean()
  }).strict()),
  wroteExpendableArtifactsOnly: z.literal(true)
}).strict();
export type ProjectionRebuildDto = z.output<typeof projectionRebuildDtoSchema>;

export const diagnosticsInspectDtoSchema = z.object({
  schemaVersion: z.literal(workspaceOpsSchemaVersion),
  diagnostics: z.array(workspaceDiagnosticSchema),
  durableCount: z.number().int().nonnegative(),
  derivedCount: z.number().int().nonnegative()
}).strict();
export type DiagnosticsInspectDto = z.output<typeof diagnosticsInspectDtoSchema>;

export const manifestExportDtoSchema = z.object({
  schemaVersion: z.literal(workspaceOpsSchemaVersion),
  workspace: workspaceRefSchema,
  exportedAt: z.string().datetime(),
  manifestHash: sha256HashSchema,
  includedSections: z.array(workspaceManifestSectionSchema).min(1),
  excludedSecretBearingFields: z.array(secretSafeWorkspaceTextSchema),
  ledger: z.object({
    eventCount: z.number().int().nonnegative(),
    highWaterMark: z.number().int().nonnegative()
  }).strict(),
  blobStore: z.object({
    contentAddressedRootCount: z.number().int().nonnegative(),
    aggregateBytes: z.number().int().nonnegative()
  }).strict(),
  artifacts: z.array(z.object({
    category: workspaceRootCategorySchema,
    count: z.number().int().nonnegative(),
    bytes: z.number().int().nonnegative(),
    artifactHash: sha256HashSchema.optional()
  }).strict()),
  diagnostics: z.object({
    errorCount: z.number().int().nonnegative(),
    warningCount: z.number().int().nonnegative()
  }).strict(),
  jobs: z.object({
    queuedCount: z.number().int().nonnegative(),
    failedCount: z.number().int().nonnegative()
  }).strict(),
  coverage: z.object({
    coveredCategories: z.array(workspaceRootCategorySchema),
    missingCategories: z.array(workspaceRootCategorySchema)
  }).strict(),
  sectionHashes: z.array(z.object({
    sectionId: workspaceManifestSectionSchema,
    sectionHash: sha256HashSchema
  }).strict()).min(1)
}).strict();
export type ManifestExportDto = z.output<typeof manifestExportDtoSchema>;

export const backupCheckDtoSchema = z.object({
  schemaVersion: z.literal(workspaceOpsSchemaVersion),
  backupManifestPresent: z.boolean(),
  identityMatches: z.boolean(),
  layoutContractMatches: z.boolean(),
  currentWorkspaceId: workspaceIdSchema,
  backupWorkspaceId: workspaceIdSchema.optional(),
  currentLedgerHighWaterMark: z.number().int().nonnegative(),
  backupLedgerHighWaterMark: z.number().int().nonnegative().optional(),
  coveredCategories: z.array(workspaceRootCategorySchema),
  missingCategories: z.array(workspaceRootCategorySchema),
  stale: z.boolean(),
  containsSecretShapedFields: z.boolean(),
  safeNextActions: z.array(workspaceNextCommandHintSchema)
}).strict();
export type BackupCheckDto = z.output<typeof backupCheckDtoSchema>;

export const workspaceOpsCommandPayloadSchemas = {
  "verify workspace": workspaceVerifyDtoSchema,
  "disk usage": diskUsageDtoSchema,
  "detect drive": mountStatusSchema,
  "projection rebuild-readiness": projectionRebuildDtoSchema,
  "projection rebuild": projectionRebuildDtoSchema,
  "diagnostics inspect": diagnosticsInspectDtoSchema,
  "manifest export": manifestExportDtoSchema,
  "backup check": backupCheckDtoSchema
} as const;

const workspaceOpsEnvelopeObjectSchema = z.object({
  schemaVersion: z.literal(workspaceOpsSchemaVersion),
  command: workspaceCommandSchema,
  ok: z.boolean(),
  status: workspaceOpsStatusSchema,
  workspace: workspaceRefSchema.optional(),
  payload: workspacePayloadSchema.optional(),
  diagnostics: z.array(workspaceDiagnosticSchema),
  proposedActions: z.array(proposedRepairActionSchema)
}).strict().superRefine((envelope, ctx) => {
  const expectedOk = envelope.status === "ready";
  if (envelope.ok !== expectedOk) {
    ctx.addIssue({
      code: "custom",
      path: ["ok"],
      message: "ok must be true only when status is ready"
    });
  }
}).transform((envelope, ctx) => {
  if (envelope.payload !== undefined) {
    const payloadResult = workspaceOpsCommandPayloadSchemas[envelope.command].safeParse(envelope.payload);
    if (!payloadResult.success) {
      for (const issue of payloadResult.error.issues) {
        ctx.addIssue({
          code: "custom",
          path: ["payload", ...issue.path],
          message: issue.message
        });
      }
      return z.NEVER;
    }

    if (envelope.command === "projection rebuild-readiness" || envelope.command === "projection rebuild") {
      const expectedMode = envelope.command === "projection rebuild-readiness" ? "readiness" : "result";
      const projectionPayload = payloadResult.data as ProjectionRebuildDto;
      if (projectionPayload.mode !== expectedMode) {
        ctx.addIssue({
          code: "custom",
          path: ["payload", "mode"],
          message: `${envelope.command} payload mode must be ${expectedMode}`
        });
        return z.NEVER;
      }
    }

    return {
      ...envelope,
      payload: payloadResult.data
    };
  }

  return envelope;
});
export const workspaceOpsEnvelopeSchema = workspaceEnvelopeInputSchema.pipe(workspaceOpsEnvelopeObjectSchema);
export type WorkspaceOpsEnvelope<TPayload = unknown> = Omit<
  z.output<typeof workspaceOpsEnvelopeSchema>,
  "payload"
> & {
  readonly payload?: TPayload;
};

export interface CreateWorkspaceOpsEnvelopeInput<TPayload> {
  readonly command: WorkspaceOpsCommand;
  readonly status: WorkspaceOpsStatus;
  readonly workspace?: WorkspaceRefDto;
  readonly payload?: TPayload;
  readonly diagnostics?: readonly WorkspaceDiagnosticInput[];
  readonly proposedActions?: readonly ProposedRepairActionInput[];
}

export function createWorkspaceOpsEnvelope<TPayload>(
  input: CreateWorkspaceOpsEnvelopeInput<TPayload>
): WorkspaceOpsEnvelope<TPayload> {
  const envelope = {
    schemaVersion: workspaceOpsSchemaVersion,
    command: input.command,
    ok: input.status === "ready",
    status: input.status,
    ...(input.workspace === undefined ? {} : { workspace: input.workspace }),
    ...(input.payload === undefined ? {} : { payload: input.payload }),
    diagnostics: [...(input.diagnostics ?? [])],
    proposedActions: [...(input.proposedActions ?? [])]
  };

  return workspaceOpsEnvelopeSchema.parse(envelope) as WorkspaceOpsEnvelope<TPayload>;
}

export function formatWorkspaceOpsJson(value: unknown): string {
  return `${JSON.stringify(workspaceOpsEnvelopeSchema.parse(value), null, 2)}\n`;
}
