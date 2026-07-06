import { z } from "zod";

export const workspaceOpsPackageName = "@cestus/workspace-ops";
export const workspaceOpsSchemaVersion = "workspace-ops.v1" as const;

const secretTextPattern =
  /(?:^|[^a-z0-9])(?:access[\s._-]*token|api[\s._-]*key|authorization|bearer|token|password|private[\s._-]*key|client[\s._-]*secret|refresh[\s._-]*secret|session[\s._-]*secret|oauth|credential)(?:\s*[:=]\s*|\s+)(?=[a-z0-9._~+/=-]{3,})[a-z0-9][a-z0-9._~+/=-]*/i;

export function isSecretSafeWorkspaceText(value: string): boolean {
  return !secretTextPattern.test(value);
}

export const secretSafeWorkspaceTextSchema = z.string().min(1).refine(isSecretSafeWorkspaceText, {
  message: "workspace ops text must not contain secrets"
});

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
        if (!Object.prototype.hasOwnProperty.call(value, index)) {
          return {
            ok: false,
            path: [...path, index],
            message: "workspace ops payload arrays must not contain sparse entries"
          };
        }

        const result = normalizeWorkspacePayload(value[index], [...path, index], seen);
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

      if (!isSecretSafeWorkspaceText(key)) {
        return { ok: false, path, message: "workspace ops payload keys must not contain secrets" };
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
      normalized[key] = result.value;
    }

    return { ok: true, value: normalized };
  } finally {
    seen.delete(value);
  }
}

const workspacePayloadSchema = z.unknown().transform((value, ctx) => {
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
  diagnosticId: z.string().regex(/^diag_[a-zA-Z0-9_-]+$/),
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
  relatedIds: z.array(secretSafeWorkspaceTextSchema).default([]),
  repairHint: z.object({
    allowedNextCommands: z.array(workspaceCommandSchema).min(1),
    requiresHumanApproval: z.boolean()
  }).strict()
}).strict();
export type WorkspaceDiagnosticDto = z.output<typeof workspaceDiagnosticSchema>;
export type WorkspaceDiagnosticInput = z.input<typeof workspaceDiagnosticSchema>;

export const proposedRepairActionSchema = z.object({
  actionId: z.string().regex(/^(repair|action)_[a-zA-Z0-9_-]+$/),
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
  workspaceId: z.string().regex(/^ws_[a-zA-Z0-9_-]+$/),
  label: secretSafeWorkspaceTextSchema,
  manifestVersion: z.number().int().positive(),
  rootUri: secretSafeWorkspaceTextSchema,
  layoutContractVersion: secretSafeWorkspaceTextSchema
}).strict();
export type WorkspaceRefDto = z.output<typeof workspaceRefSchema>;

export const mountStatusSchema = z.object({
  status: z.enum(["available", "missing", "unmounted", "wrong-drive", "unreadable"]),
  safeMessage: secretSafeWorkspaceTextSchema,
  expectedRootUri: secretSafeWorkspaceTextSchema.optional()
}).strict();
export type MountStatusDto = z.output<typeof mountStatusSchema>;

export const workspaceOpsEnvelopeSchema = z.object({
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
});
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
