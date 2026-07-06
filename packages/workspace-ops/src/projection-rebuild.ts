import { createHash } from "node:crypto";
import { basename, isAbsolute, posix, win32 } from "node:path";
import { validateKnowledgeEvent, type KnowledgeEvent } from "../../ontology/src/contracts.js";
import {
  createWorkspaceOpsEnvelope,
  isSecretSafeWorkspaceText,
  workspaceOpsSchemaVersion,
  type ProposedRepairActionInput,
  type ProjectionRebuildDto,
  type WorkspaceDiagnosticInput,
  type WorkspaceOpsEnvelope
} from "./contracts.js";
import { childPath } from "./filesystem.js";
import type { ResolvedWorkspaceLayout } from "./layout.js";
import type { WorkspaceEventReader } from "./ops.js";

export interface ProjectionArtifactFileSystem {
  exists(path: string): Promise<boolean>;
  writeText(path: string, content: string): Promise<void>;
  remove(path: string): Promise<void>;
  promoteDirectory(from: string, to: string): Promise<void>;
  availableBytes(path: string): Promise<number | undefined>;
}

export interface ProjectionBuilder {
  readonly projectionName: string;
  build(events: readonly KnowledgeEvent[]): Promise<Record<string, string>>;
}

export interface ProjectionRebuildReadinessInput {
  readonly layout: ResolvedWorkspaceLayout;
  readonly projectionName: string;
  readonly fileSystem: ProjectionArtifactFileSystem;
  readonly eventReader: WorkspaceEventReader;
}

export interface ProjectionRebuildInput extends ProjectionRebuildReadinessInput {
  readonly builder: ProjectionBuilder;
  readonly rebuildId: string;
}

type ProjectionReadinessCheck = ProjectionRebuildDto["readiness"]["checks"][number];
type ProjectionValidationResult = ProjectionRebuildDto["validationResults"][number];
type ProjectionFailure = ProjectionRebuildDto["failures"][number];
type ProjectionArtifactOutput = ProjectionRebuildDto["artifactOutputs"][number];

interface LedgerReadResult {
  readonly inputLedger: ProjectionRebuildDto["inputLedger"];
  readonly events: readonly KnowledgeEvent[];
  readonly diagnostics: readonly WorkspaceDiagnosticInput[];
  readonly proposedActions: readonly ProposedRepairActionInput[];
  readonly checks: readonly ProjectionReadinessCheck[];
  readonly validationResults: readonly ProjectionValidationResult[];
}

interface ProjectionRootReadiness {
  readonly checks: readonly ProjectionReadinessCheck[];
  readonly diagnostics: readonly WorkspaceDiagnosticInput[];
}

interface ArtifactPlan {
  readonly artifactPath: string;
  readonly artifactOutput: ProjectionArtifactOutput;
  readonly content: string;
}

export async function rebuildProjectionReadiness(
  input: ProjectionRebuildReadinessInput
): Promise<WorkspaceOpsEnvelope<ProjectionRebuildDto>> {
  const projectionNameFailure = projectionNameValidationFailure(input.projectionName);
  if (projectionNameFailure !== undefined) {
    return invalidRequestEnvelope({
      command: "projection rebuild-readiness",
      mode: "readiness",
      projectionName: input.projectionName,
      failure: projectionNameFailure
    });
  }

  const ledger = await readAndValidateLedger(input.layout, input.eventReader);
  const projectionRoot = await inspectProjectionRoot(input.layout, input.fileSystem);
  const checks = [...ledger.checks, ...projectionRoot.checks, preservationCheck()];
  const diagnostics = [...ledger.diagnostics, ...projectionRoot.diagnostics];
  const proposedActions = [...ledger.proposedActions];

  return createWorkspaceOpsEnvelope({
    command: "projection rebuild-readiness",
    status: statusForReadiness(checks),
    payload: projectionPayload({
      mode: "readiness",
      projectionName: input.projectionName,
      inputLedger: ledger.inputLedger,
      checks,
      validationResults: ledger.validationResults
    }),
    diagnostics,
    proposedActions
  });
}

export async function rebuildProjection(
  input: ProjectionRebuildInput
): Promise<WorkspaceOpsEnvelope<ProjectionRebuildDto>> {
  const requestFailure =
    projectionNameValidationFailure(input.projectionName) ??
    rebuildIdValidationFailure(input.rebuildId) ??
    builderValidationFailure(input.projectionName, input.builder.projectionName);
  if (requestFailure !== undefined) {
    return invalidRequestEnvelope({
      command: "projection rebuild",
      mode: "result",
      projectionName: input.projectionName,
      failure: requestFailure
    });
  }

  const ledger = await readAndValidateLedger(input.layout, input.eventReader);
  const projectionRoot = await inspectProjectionRoot(input.layout, input.fileSystem);
  const checks = [...ledger.checks, ...projectionRoot.checks, preservationCheck()];
  const diagnostics = [...ledger.diagnostics, ...projectionRoot.diagnostics];
  const proposedActions = [...ledger.proposedActions];
  if (checks.some((check) => check.status === "fail")) {
    return createWorkspaceOpsEnvelope({
      command: "projection rebuild",
      status: "blocked",
      payload: projectionPayload({
        mode: "result",
        projectionName: input.projectionName,
        inputLedger: ledger.inputLedger,
        checks,
        validationResults: ledger.validationResults,
        failures: [failure("failure_projection_readiness", "Projection rebuild readiness failed.", true)]
      }),
      diagnostics,
      proposedActions
    });
  }

  const tempRoot = projectionChildPath(input.layout, `.tmp-${input.rebuildId}`);
  const finalRoot = projectionChildPath(input.layout, input.projectionName);

  try {
    const artifacts = await input.builder.build(ledger.events);
    const artifactPlans = planArtifacts(input.layout, input.projectionName, tempRoot, artifacts);
    await input.fileSystem.remove(tempRoot);
    for (const artifact of artifactPlans) {
      await input.fileSystem.writeText(artifact.artifactPath, artifact.content);
    }
    await input.fileSystem.promoteDirectory(tempRoot, finalRoot);

    return createWorkspaceOpsEnvelope({
      command: "projection rebuild",
      status: "ready",
      payload: projectionPayload({
        mode: "result",
        projectionName: input.projectionName,
        inputLedger: ledger.inputLedger,
        checks,
        artifactOutputs: artifactPlans.map((artifact) => artifact.artifactOutput),
        validationResults: [
          ...ledger.validationResults,
          validationResult("validation_projection_output", "pass", "Projection output validated.")
        ]
      }),
      diagnostics,
      proposedActions
    });
  } catch {
    await safeRemoveTemp(input.fileSystem, tempRoot);
    return createWorkspaceOpsEnvelope({
      command: "projection rebuild",
      status: "degraded",
      payload: projectionPayload({
        mode: "result",
        projectionName: input.projectionName,
        inputLedger: ledger.inputLedger,
        checks,
        validationResults: [
          ...ledger.validationResults,
          validationResult("validation_projection_output", "fail", "Projection output was not promoted.")
        ],
        failures: [
          failure(
            "failure_projection_rebuild",
            "Projection rebuild failed; previous artifacts were preserved.",
            true
          )
        ]
      }),
      diagnostics: [
        ...diagnostics,
        {
          diagnosticId: "diag_projection_rebuild_failed",
          severity: "error",
          category: "projection",
          message: "Projection rebuild failed; previous artifacts were preserved.",
          durable: false,
          repairHint: {
            allowedNextCommands: ["projection rebuild-readiness"],
            requiresHumanApproval: false
          }
        }
      ],
      proposedActions
    });
  }
}

async function readAndValidateLedger(
  layout: ResolvedWorkspaceLayout,
  eventReader: WorkspaceEventReader
): Promise<LedgerReadResult> {
  let rawEvents: readonly unknown[];
  try {
    rawEvents = await eventReader.readAll(layout);
  } catch {
    return {
      inputLedger: { readable: false, eventCount: 0, highWaterMark: 0 },
      events: [],
      checks: [check("ledger_readable", "fail", "Workspace ledger could not be read safely.")],
      validationResults: [validationResult("validation_ledger_events", "fail", "Ledger events could not be validated.")],
      proposedActions: [canonicalLedgerRepairAction("repair_projection_ledger_read_failed")],
      diagnostics: [
        {
          diagnosticId: "diag_projection_ledger_read_failed",
          severity: "error",
          category: "ledger",
          message: "Workspace ledger could not be read safely.",
          durable: false,
          repairHint: {
            allowedNextCommands: ["diagnostics inspect"],
            requiresHumanApproval: true
          }
        }
      ]
    };
  }

  const events: KnowledgeEvent[] = [];
  let invalidEventCount = 0;
  for (const event of rawEvents) {
    const eventResult = validateKnowledgeEvent(event);
    if (eventResult.success) {
      events.push(eventResult.data);
    } else {
      invalidEventCount += 1;
    }
  }

  const inputLedger = {
    readable: true,
    eventCount: rawEvents.length,
    highWaterMark: rawEvents.length
  };

  if (invalidEventCount > 0) {
    return {
      inputLedger,
      events: [],
      checks: [
        check("ledger_readable", "pass", "Workspace ledger is readable."),
        check("ledger_events_valid", "fail", "Ledger events failed contract validation.")
      ],
      validationResults: [
        validationResult("validation_ledger_events", "fail", "Ledger events failed contract validation.")
      ],
      proposedActions: [canonicalLedgerRepairAction("repair_projection_ledger_event_validation_failed")],
      diagnostics: [
        {
          diagnosticId: "diag_projection_ledger_event_validation_failed",
          severity: "error",
          category: "ledger",
          message: "Ledger events failed contract validation.",
          durable: false,
          repairHint: {
            allowedNextCommands: ["diagnostics inspect"],
            requiresHumanApproval: true
          }
        }
      ]
    };
  }

  return {
    inputLedger,
    events,
    checks: [
      check("ledger_readable", "pass", "Workspace ledger is readable."),
      check("ledger_events_valid", "pass", "Ledger events passed contract validation.")
    ],
    validationResults: [
      validationResult("validation_ledger_events", "pass", "Ledger events passed contract validation.")
    ],
    proposedActions: [],
    diagnostics: []
  };
}

async function inspectProjectionRoot(
  layout: ResolvedWorkspaceLayout,
  fileSystem: ProjectionArtifactFileSystem
): Promise<ProjectionRootReadiness> {
  const checks: ProjectionReadinessCheck[] = [];
  const diagnostics: WorkspaceDiagnosticInput[] = [];

  try {
    const exists = await fileSystem.exists(layout.projectionRoot);
    if (exists) {
      checks.push(check("projection_root_available", "pass", "Projection root is available."));
    } else {
      checks.push(check("projection_root_available", "fail", "Projection root is not available."));
      diagnostics.push(projectionRootDiagnostic("diag_projection_root_unavailable", "Projection root is not available."));
    }
  } catch {
    checks.push(check("projection_root_available", "fail", "Projection root could not be inspected safely."));
    diagnostics.push(
      projectionRootDiagnostic("diag_projection_root_unreadable", "Projection root could not be inspected safely.")
    );
  }

  try {
    const availableBytes = await fileSystem.availableBytes(layout.projectionRoot);
    if (availableBytes === undefined) {
      checks.push(check("projection_root_capacity", "warning", "Projection root free space is unknown."));
    } else if (availableBytes > 0) {
      checks.push(check("projection_root_capacity", "pass", "Projection root has writable capacity."));
    } else {
      checks.push(check("projection_root_capacity", "fail", "Projection root does not report writable capacity."));
      diagnostics.push(
        projectionRootDiagnostic(
          "diag_projection_disk_unavailable",
          "Projection root does not report writable capacity."
        )
      );
    }
  } catch {
    checks.push(check("projection_root_capacity", "warning", "Projection root free space could not be inspected safely."));
  }

  return { checks, diagnostics };
}

function planArtifacts(
  layout: ResolvedWorkspaceLayout,
  projectionName: string,
  tempRoot: string,
  artifacts: Record<string, string>
): ArtifactPlan[] {
  const plans: ArtifactPlan[] = [];
  for (const [artifactName, content] of Object.entries(artifacts).sort(([left], [right]) => left.localeCompare(right))) {
    if (!isSafeArtifactName(artifactName)) {
      throw new Error("unsafe projection artifact name");
    }
    if (typeof content !== "string") {
      throw new Error("projection artifact content must be text");
    }

    const artifactPath = projectionChildPath(layout, tempRootName(tempRoot), artifactName);
    plans.push({
      artifactPath,
      content,
      artifactOutput: {
        projectionName,
        artifactId: artifactIdFor(projectionName, artifactName),
        artifactHash: hashText(content),
        byteCount: Buffer.byteLength(content, "utf8"),
        expendable: true
      }
    });
  }
  return plans;
}

function projectionPayload(input: {
  readonly mode: ProjectionRebuildDto["mode"];
  readonly projectionName: string;
  readonly inputLedger: ProjectionRebuildDto["inputLedger"];
  readonly checks: readonly ProjectionReadinessCheck[];
  readonly artifactOutputs?: readonly ProjectionArtifactOutput[];
  readonly validationResults?: readonly ProjectionValidationResult[];
  readonly failures?: readonly ProjectionFailure[];
}): ProjectionRebuildDto {
  return {
    schemaVersion: workspaceOpsSchemaVersion,
    mode: input.mode,
    requestedProjections: [safeRequestedProjectionName(input.projectionName)],
    inputLedger: input.inputLedger,
    readiness: {
      ready: input.checks.every((item) => item.status !== "fail"),
      checks: [...input.checks]
    },
    artifactOutputs: [...(input.artifactOutputs ?? [])],
    validationResults: [...(input.validationResults ?? [])],
    failures: [...(input.failures ?? [])],
    wroteExpendableArtifactsOnly: true
  };
}

function invalidRequestEnvelope(input: {
  readonly command: "projection rebuild-readiness" | "projection rebuild";
  readonly mode: ProjectionRebuildDto["mode"];
  readonly projectionName: string;
  readonly failure: ProjectionFailure;
}): WorkspaceOpsEnvelope<ProjectionRebuildDto> {
  return createWorkspaceOpsEnvelope({
    command: input.command,
    status: "blocked",
    payload: projectionPayload({
      mode: input.mode,
      projectionName: input.projectionName,
      inputLedger: { readable: false, eventCount: 0, highWaterMark: 0 },
      checks: [check("projection_request_valid", "fail", input.failure.safeMessage)],
      validationResults: [
        validationResult("validation_projection_request", "fail", "Projection rebuild request was invalid.")
      ],
      failures: [input.failure]
    }),
    diagnostics: [
      {
        diagnosticId: "diag_projection_rebuild_request_invalid",
        severity: "error",
        category: "projection",
        message: "Projection rebuild request was invalid.",
        durable: false,
        repairHint: {
          allowedNextCommands: ["projection rebuild-readiness"],
          requiresHumanApproval: false
        }
      }
    ]
  });
}

function projectionNameValidationFailure(projectionName: string): ProjectionFailure | undefined {
  if (isSafeProjectionSegment(projectionName)) {
    return undefined;
  }
  return failure(
    "failure_projection_name_invalid",
    "Projection name must be a safe projection artifact identifier.",
    false
  );
}

function rebuildIdValidationFailure(rebuildId: string): ProjectionFailure | undefined {
  if (isSafeProjectionSegment(rebuildId)) {
    return undefined;
  }
  return failure("failure_projection_rebuild_id_invalid", "Projection rebuild id must be a safe identifier.", false);
}

function builderValidationFailure(projectionName: string, builderProjectionName: string): ProjectionFailure | undefined {
  if (builderProjectionName === projectionName) {
    return undefined;
  }
  return failure("failure_projection_builder_mismatch", "Projection builder must match the requested projection.", false);
}

function projectionRootDiagnostic(
  diagnosticId: WorkspaceDiagnosticInput["diagnosticId"],
  message: string
): WorkspaceDiagnosticInput {
  return {
    diagnosticId,
    severity: "error",
    category: "projection",
    message,
    durable: false,
    repairHint: {
      allowedNextCommands: ["projection rebuild-readiness", "disk usage"],
      requiresHumanApproval: false
    }
  };
}

function canonicalLedgerRepairAction(
  actionId: ProposedRepairActionInput["actionId"]
): ProposedRepairActionInput {
  return {
    actionId,
    kind: "append-repair-event-required",
    title: "Record a human-approved canonical ledger repair event.",
    severity: "error",
    requiresHumanApproval: true,
    mutatesCanonicalState: true,
    allowedNextCommands: ["diagnostics inspect"]
  };
}

function preservationCheck(): ProjectionReadinessCheck {
  return check("prior_artifacts_preserved", "pass", "Projection rebuild uses temp artifacts before promotion.");
}

function check(
  checkId: ProjectionReadinessCheck["checkId"],
  status: ProjectionReadinessCheck["status"],
  safeMessage: string
): ProjectionReadinessCheck {
  return { checkId, status, safeMessage };
}

function validationResult(
  validationId: ProjectionValidationResult["validationId"],
  status: ProjectionValidationResult["status"],
  safeMessage: string
): ProjectionValidationResult {
  return { validationId, status, safeMessage };
}

function failure(
  failureId: ProjectionFailure["failureId"],
  safeMessage: string,
  retryable: boolean
): ProjectionFailure {
  return { failureId, safeMessage, retryable };
}

function statusForReadiness(checks: readonly ProjectionReadinessCheck[]): "ready" | "degraded" | "blocked" {
  if (checks.some((item) => item.status === "fail")) {
    return "blocked";
  }
  return checks.some((item) => item.status === "warning") ? "degraded" : "ready";
}

async function safeRemoveTemp(fileSystem: ProjectionArtifactFileSystem, tempRoot: string): Promise<void> {
  try {
    await fileSystem.remove(tempRoot);
  } catch {
    // Best-effort cleanup must not mask the preserved-prior-artifacts result.
  }
}

function projectionChildPath(layout: ResolvedWorkspaceLayout, ...children: string[]): string {
  const path = childPath(layout.projectionRoot, ...children);
  if (!isUnderProjectionRoot(path, layout.projectionRoot)) {
    throw new Error("projection artifact path escaped projection root");
  }
  return path;
}

function isUnderProjectionRoot(path: string, projectionRoot: string): boolean {
  return path === projectionRoot || path.startsWith(`${projectionRoot}/`);
}

function isSafeProjectionSegment(value: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(value) && isSecretSafeWorkspaceText(value);
}

function isSafeArtifactName(value: string): boolean {
  return (
    value.length > 0 &&
    value !== "." &&
    value !== ".." &&
    !value.includes("\0") &&
    !value.includes("/") &&
    !value.includes("\\") &&
    !isAbsolute(value) &&
    !win32.isAbsolute(value) &&
    basename(value) === value &&
    posix.basename(value) === value &&
    win32.basename(value) === value &&
    /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value) &&
    isSecretSafeWorkspaceText(value)
  );
}

function tempRootName(tempRoot: string): string {
  return basename(tempRoot);
}

function safeRequestedProjectionName(projectionName: string): string {
  return projectionName.length > 0 && isSecretSafeWorkspaceText(projectionName)
    ? projectionName
    : "invalid_projection_request";
}

function artifactIdFor(projectionName: string, artifactName: string): string {
  return `artifact_${identifierPart(projectionName)}_${identifierPart(artifactName)}`;
}

function identifierPart(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return normalized.length > 0 ? normalized : "artifact";
}

function hashText(value: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}
