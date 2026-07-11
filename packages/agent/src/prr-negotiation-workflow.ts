import type { AppendableKnowledgeEvent, KnowledgeEvent } from "../../ontology/src/contracts.js";
import {
  buildPrrCorrespondenceApprovalPreview,
  prrFollowUpExecuteDescriptor,
  type BuildPrrCorrespondencePreviewInput
} from "./adapters/prr-correspondence.js";
import { assertAgentSecretSafeText } from "./secret-safety.js";
import { validateProductionSpecialistProviderOutput } from "./production-specialist-output-contracts.js";
import { createAgentToolGateway } from "./tool-gateway.js";
import {
  parseLegacySpecialistWorkflowHandoff,
  type LegacySpecialistWorkflowHandoffDto
} from "./specialist-handoffs.js";
import {
  appendSpecialistCompletion,
  appendSpecialistDerivativeStep,
  appendSpecialistFailure,
  assertSpecialistDerivativeStoreAvailable,
  assertSpecialistStepNotRecorded,
  invokeSpecialistModel,
  normalizeSpecialistJsonValue,
  prepareSpecialistRun,
  writeSpecialistDerivativeArtifact,
  type SpecialistRunnerBaseInput
} from "./specialist-runner-kernel.js";

export interface RunPrrNegotiationWorkflowInput extends SpecialistRunnerBaseInput {
  readonly prrRequestId: string;
  readonly correspondenceId: string;
  readonly jurisdictionRuleRefs: readonly string[];
  readonly followUpApprovalPreview?: PrrNegotiationFollowUpApprovalPreviewInput;
}

export interface RunPrrNegotiationWorkflowResult {
  readonly handoff: LegacySpecialistWorkflowHandoffDto;
  readonly eventIds: readonly string[];
}

export type PrrNegotiationFollowUpApprovalPreviewInput = Omit<
  BuildPrrCorrespondencePreviewInput,
  | "toolRequestId"
  | "toolId"
  | "toolVersion"
  | "runId"
  | "taskId"
  | "residentAgentId"
  | "prrRequestId"
  | "correspondenceId"
>;

interface PrrNegotiationFollowUpApprovalPreflight {
  readonly toolRequestId: string;
  readonly previewInput: PrrNegotiationFollowUpApprovalPreviewInput;
  readonly preflightPreview: ReturnType<typeof buildPrrCorrespondenceApprovalPreview>;
}

export async function runPrrNegotiationWorkflow(
  input: RunPrrNegotiationWorkflowInput
): Promise<RunPrrNegotiationWorkflowResult> {
  await assertSpecialistStepNotRecorded(input.ledger, input.runId, "step_prr_negotiation_draft");
  const toolRequestId = `toolreq_${input.runId}_followup`;
  const followUpPreflight = preflightFollowUpApprovalPreview(input, toolRequestId);
  assertSpecialistDerivativeStoreAvailable(input);
  const prepared = await prepareSpecialistRun(input, "prr-negotiation");
  const invocationId = `inv_${input.runId}_prr_negotiation`;
  const invocation = await invokeSpecialistModel(input, prepared, invocationId);
  const output = parseModelOutput(invocation.outputText);
  if (output === undefined) {
    return await failedModelOutputResult(input, prepared, invocation.eventIds);
  }
  let draftArtifact: Awaited<ReturnType<typeof writeSpecialistDerivativeArtifact>>;
  try {
    draftArtifact = await writeSpecialistDerivativeArtifact({
      derivativeStore: input.derivativeStore,
      artifactKind: "correspondence-draft-artifact",
      payload: {
        schemaVersion: "prr-negotiation-handoff.v1",
        artifactKind: "correspondence-draft-artifact",
        runId: input.runId,
        taskId: input.taskId,
        prrRequestId: input.prrRequestId,
        correspondenceId: input.correspondenceId,
        domainSourceBindings: prrAdvisoryDomainSourceBindings(followUpPreflight),
        draftSummary: output.draftSummary,
        citedRuleRefs: [...output.citedRuleRefs]
      }
    });
  } catch {
    return await failedDerivativeArtifactResult(input, prepared, invocation.eventIds);
  }
  const draftHash = draftArtifact.artifactHash;
  const draftStep = await appendSpecialistDerivativeStep({
    ledger: input.ledger, actor: input.actor, now: input.now, runId: input.runId,
    stepId: "step_prr_negotiation_draft", summary: "Created a local PRR negotiation advisory artifact for human review; the sendable message remains domain supplied.",
    invocationId, inputArtifactHashes: [prepared.promptArtifact.manifest.inputArtifactHash, invocation.outputArtifactHash],
    outputArtifactHashes: [draftHash]
  });

  const approval = output.requestFollowUpApproval
    ? await requestFollowUpApproval(input, followUpPreflight, output.citedRuleRefs)
    : undefined;
  const completed = await appendSpecialistCompletion({
    ledger: input.ledger,
    actor: input.actor,
    now: input.now,
    runId: input.runId,
    summary: approval === undefined
      ? "PRR negotiation advisory artifact is complete and ready for local review."
      : "PRR negotiation advisory artifact is complete; the exact PRR follow-up approval request is pending separately.",
    outputArtifactHashes: [draftHash],
    relatedEventIds: [draftStep.id, ...(approval === undefined ? [] : [approval.requested.id])]
  });
  const handoff = parseLegacySpecialistWorkflowHandoff({
    schemaVersion: "agent-specialist-handoff.v1", runType: "prr-negotiation", runId: input.runId, taskId: input.taskId,
    residentAgentId: "agent_default", generatedAt: input.now(), status: approval === undefined ? "ready-for-review" : "waiting-for-approval",
    safeSummary: approval === undefined
      ? "PRR negotiation advisory artifact is ready for human review."
      : "PRR negotiation advisory artifact is ready for review and domain-supplied follow-up approval.",
    contextPackRefs: prepared.contextPackRefs, promptArtifactHash: prepared.promptArtifact.manifest.inputArtifactHash,
    outputArtifacts: [{ artifactId: `artifact_${input.runId}_draft`, artifactKind: "correspondence-draft-artifact", schemaId: "prr-negotiation-handoff.v1", artifactHash: draftHash, safeSummary: "Local PRR negotiation advisory artifact hash is ready for human review." }],
    toolRequestIds: approval === undefined ? [] : [toolRequestId],
    approvalRequirements: approval === undefined
      ? []
      : [{ approvalClass: "external-message-send", reason: "Human approval is required before a PRR follow-up can leave draft state.", toolRequestId }],
    nextSafeActions: approval === undefined
      ? [{ actionId: `action_${input.runId}_review`, label: "Review the PRR correspondence draft", kind: "review", effect: "none", artifactId: `artifact_${input.runId}_draft` }]
      : [{ actionId: `action_${input.runId}_review`, label: "Review the PRR correspondence draft", kind: "review", effect: "none", artifactId: `artifact_${input.runId}_draft` }, { actionId: `action_${input.runId}_approval`, label: "Request follow-up send approval", kind: "request-approval", effect: "request-approval", toolRequestId }]
  });
  return Object.freeze({
    handoff,
    eventIds: Object.freeze([
      ...invocation.eventIds,
      draftStep.id,
      ...(approval === undefined ? [] : [approval.drafted.id, approval.requested.id]),
      completed.id
    ])
  });
}

function parseModelOutput(outputText: string) {
  try {
    const output = validateProductionSpecialistProviderOutput({
      runType: "prr-negotiation",
      value: JSON.parse(outputText)
    });
    return output.runType === "prr-negotiation" ? output.value : undefined;
  } catch {
    return undefined;
  }
}

async function failedModelOutputResult(
  input: RunPrrNegotiationWorkflowInput,
  prepared: Awaited<ReturnType<typeof prepareSpecialistRun>>,
  invocationEventIds: readonly string[]
): Promise<RunPrrNegotiationWorkflowResult> {
  const failed = await appendSpecialistFailure({
    ledger: input.ledger,
    actor: input.actor,
    now: input.now,
    runId: input.runId,
    category: "model-output-invalid",
    message: "PRR negotiation model output did not match the required structured schema.",
    retryable: true,
    allowedActions: ["retry with a provider that returns the approved PRR negotiation schema"],
    ...(invocationEventIds.at(-1) === undefined ? {} : { causationId: invocationEventIds.at(-1) })
  });
  const handoff = parseLegacySpecialistWorkflowHandoff({
    schemaVersion: "agent-specialist-handoff.v1",
    runType: "prr-negotiation",
    runId: input.runId,
    taskId: input.taskId,
    residentAgentId: "agent_default",
    generatedAt: input.now(),
    status: "failed",
    safeSummary: "PRR negotiation could not produce a valid structured draft.",
    contextPackRefs: prepared.contextPackRefs,
    promptArtifactHash: prepared.promptArtifact.manifest.inputArtifactHash,
    outputArtifacts: [],
    toolRequestIds: [],
    approvalRequirements: [],
    nextSafeActions: [{
      actionId: `action_${input.runId}_retry_model`,
      label: "Retry PRR negotiation model output",
      kind: "retry",
      effect: "none"
    }],
    failure: {
      category: "model-output-invalid",
      code: "prr-negotiation-model-output-invalid",
      safeSummary: "Model output failed PRR negotiation schema validation.",
      retryable: true
    }
  });
  return Object.freeze({ handoff, eventIds: Object.freeze([...invocationEventIds, failed.id]) });
}

async function failedDerivativeArtifactResult(
  input: RunPrrNegotiationWorkflowInput,
  prepared: Awaited<ReturnType<typeof prepareSpecialistRun>>,
  invocationEventIds: readonly string[]
): Promise<RunPrrNegotiationWorkflowResult> {
  const failed = await appendSpecialistFailure({
    ledger: input.ledger,
    actor: input.actor,
    now: input.now,
    runId: input.runId,
    category: "external-effect-failed",
    message: "PRR negotiation derivative artifact storage failed before ledger publication.",
    retryable: true,
    allowedActions: ["inspect local derivative artifact storage and retry PRR negotiation"],
    ...(invocationEventIds.at(-1) === undefined ? {} : { causationId: invocationEventIds.at(-1) })
  });
  const handoff = parseLegacySpecialistWorkflowHandoff({
    schemaVersion: "agent-specialist-handoff.v1",
    runType: "prr-negotiation",
    runId: input.runId,
    taskId: input.taskId,
    residentAgentId: "agent_default",
    generatedAt: input.now(),
    status: "failed",
    safeSummary: "PRR negotiation could not publish the local advisory artifact.",
    contextPackRefs: prepared.contextPackRefs,
    promptArtifactHash: prepared.promptArtifact.manifest.inputArtifactHash,
    outputArtifacts: [],
    toolRequestIds: [],
    approvalRequirements: [],
    nextSafeActions: [{
      actionId: `action_${input.runId}_retry_storage`,
      label: "Retry PRR negotiation after derivative storage is healthy",
      kind: "retry",
      effect: "none"
    }],
    failure: {
      category: "external-effect-failed",
      code: "prr-negotiation-derivative-storage-failed",
      safeSummary: "Derivative artifact storage failed before any specialist step or tool request was recorded.",
      retryable: true
    }
  });
  return Object.freeze({ handoff, eventIds: Object.freeze([...invocationEventIds, failed.id]) });
}

async function requestFollowUpApproval(
  input: RunPrrNegotiationWorkflowInput,
  preflight: PrrNegotiationFollowUpApprovalPreflight,
  citedRuleRefs: readonly string[]
): Promise<{ readonly drafted: KnowledgeEvent; readonly requested: KnowledgeEvent }> {
  const drafted = await appendPrrFollowupDrafted(input, preflight.previewInput, citedRuleRefs);
  const preview = buildFollowUpApprovalPreview(input, preflight, drafted.id);
  const gateway = createAgentToolGateway({ ledger: input.ledger, actor: input.actor, now: input.now });
  const requested = await gateway.requestTool({
    toolRequestId: preflight.toolRequestId,
    residentAgentId: "agent_default",
    taskId: input.taskId,
    runId: input.runId,
    toolId: preview.toolId,
    toolVersion: preview.toolVersion,
    sideEffectClass: preview.sideEffectClass,
    requiredApprovalClass: "external-message-send",
    preview,
    inputArtifactHashes: prrPreviewArtifactHashes(preview)
  });
  return Object.freeze({ drafted, requested });
}

function preflightFollowUpApprovalPreview(
  input: RunPrrNegotiationWorkflowInput,
  toolRequestId: string
): PrrNegotiationFollowUpApprovalPreflight {
  if (input.followUpApprovalPreview === undefined) {
    throw new Error("PRR follow-up approval preview is required before running approval-capable PRR negotiation.");
  }
  const previewInput = normalizeSpecialistJsonValue(
    input.followUpApprovalPreview,
    "PRR follow-up approval preview"
  ) as PrrNegotiationFollowUpApprovalPreviewInput;
  const preflight = buildPrrCorrespondenceApprovalPreview({
    ...previewInput,
    toolRequestId,
    toolId: prrFollowUpExecuteDescriptor.toolId,
    toolVersion: prrFollowUpExecuteDescriptor.toolVersion,
    runId: input.runId,
    taskId: input.taskId,
    residentAgentId: "agent_default",
    prrRequestId: input.prrRequestId,
    correspondenceId: input.correspondenceId,
    messageSourceEventId: previewInput.messageSourceEventId
  });
  return Object.freeze({
    toolRequestId,
    previewInput,
    preflightPreview: preflight
  });
}

function buildFollowUpApprovalPreview(
  input: RunPrrNegotiationWorkflowInput,
  preflight: PrrNegotiationFollowUpApprovalPreflight,
  messageSourceEventId: string
): ReturnType<typeof buildPrrCorrespondenceApprovalPreview> {
  const preview = buildPrrCorrespondenceApprovalPreview({
    ...preflight.previewInput,
    toolRequestId: preflight.toolRequestId,
    toolId: prrFollowUpExecuteDescriptor.toolId,
    toolVersion: prrFollowUpExecuteDescriptor.toolVersion,
    runId: input.runId,
    taskId: input.taskId,
    residentAgentId: "agent_default",
    prrRequestId: input.prrRequestId,
    correspondenceId: input.correspondenceId,
    messageSourceEventId
  });
  assertFollowUpPreviewStillMatchesPreflight(preflight.preflightPreview, preview);
  return preview;
}

function assertFollowUpPreviewStillMatchesPreflight(
  preflight: ReturnType<typeof buildPrrCorrespondenceApprovalPreview>,
  preview: ReturnType<typeof buildPrrCorrespondenceApprovalPreview>
): void {
  if (
    preview.toolId !== preflight.toolId ||
    preview.toolVersion !== preflight.toolVersion ||
    preview.runId !== preflight.runId ||
    preview.taskId !== preflight.taskId ||
    preview.residentAgentId !== preflight.residentAgentId ||
    preview.prrRequestId !== preflight.prrRequestId ||
    preview.correspondenceId !== preflight.correspondenceId ||
    preview.provider !== preflight.provider ||
    preview.subjectHash !== preflight.subjectHash ||
    preview.bodyHash !== preflight.bodyHash ||
    preview.renderedBodyHash !== preflight.renderedBodyHash ||
    preview.providerIdempotencyKey !== preflight.providerIdempotencyKey ||
    !sameOrderedStrings(preview.artifactHashes ?? [], preflight.artifactHashes ?? [])
  ) {
    throw new Error("PRR follow-up approval preview changed after preflight validation.");
  }
}

function prrAdvisoryDomainSourceBindings(preflight: PrrNegotiationFollowUpApprovalPreflight) {
  const preview = preflight.preflightPreview;
  return Object.freeze({
    normalizedInputHash: requiredPreviewHash(preview, "normalizedInputHash"),
    relatedEventIds: Object.freeze([...(preview.relatedEventIds ?? [])]),
    artifactHashes: prrPreviewArtifactHashes(preview),
    provider: requiredPreviewString(preview, "provider"),
    subjectHash: requiredPreviewHash(preview, "subjectHash"),
    bodyHash: requiredPreviewHash(preview, "bodyHash"),
    renderedBodyHash: requiredPreviewHash(preview, "renderedBodyHash"),
    projectionHighWaterMarks: projectionHighWaterMarksFromPreview(preview)
  });
}

function requiredPreviewString(
  preview: ReturnType<typeof buildPrrCorrespondenceApprovalPreview>,
  key: string
): string {
  const value = preview[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`PRR advisory domain source binding missing ${key}.`);
  }
  assertAgentSecretSafeText(value, `PRR advisory domain source binding ${key}`);
  return value;
}

function requiredPreviewHash(
  preview: ReturnType<typeof buildPrrCorrespondenceApprovalPreview>,
  key: string
): `sha256:${string}` {
  const value = requiredPreviewString(preview, key);
  if (!/^sha256:[a-f0-9]{64}$/.test(value)) {
    throw new Error(`PRR advisory domain source binding has invalid ${key}.`);
  }
  return value as `sha256:${string}`;
}

function projectionHighWaterMarksFromPreview(
  preview: ReturnType<typeof buildPrrCorrespondenceApprovalPreview>
): readonly { readonly projectionName: string; readonly highWaterMark: number }[] {
  const value = preview.projectionHighWaterMarks;
  if (!Array.isArray(value)) {
    throw new Error("PRR advisory domain source binding missing projection high-water marks.");
  }
  return Object.freeze(value.map((candidate) => {
    if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
      throw new Error("PRR advisory domain source binding has invalid projection high-water mark.");
    }
    const projectionName = (candidate as { readonly projectionName?: unknown }).projectionName;
    const highWaterMark = (candidate as { readonly highWaterMark?: unknown }).highWaterMark;
    if (
      typeof projectionName !== "string" ||
      typeof highWaterMark !== "number" ||
      !Number.isSafeInteger(highWaterMark) ||
      highWaterMark < 0
    ) {
      throw new Error("PRR advisory domain source binding has invalid projection high-water mark.");
    }
    assertAgentSecretSafeText(projectionName, "PRR advisory projection high-water mark name");
    return Object.freeze({ projectionName, highWaterMark });
  }));
}

function prrPreviewArtifactHashes(preview: ReturnType<typeof buildPrrCorrespondenceApprovalPreview>): readonly `sha256:${string}`[] {
  const hashes = (preview.artifactHashes ?? []).map((hash) => {
    if (typeof hash !== "string" || !/^sha256:[a-f0-9]{64}$/.test(hash)) {
      throw new Error("PRR follow-up approval preview contains an invalid artifact hash.");
    }
    return hash as `sha256:${string}`;
  });
  return Object.freeze([...new Set(hashes)]);
}

function sameOrderedStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

async function appendPrrFollowupDrafted(
  input: RunPrrNegotiationWorkflowInput,
  previewInput: PrrNegotiationFollowUpApprovalPreviewInput,
  citedRuleRefs: readonly string[]
): Promise<KnowledgeEvent> {
  const event: AppendableKnowledgeEvent<"prr.followup.drafted"> = {
    type: "prr.followup.drafted",
    version: 1,
    streamId: input.prrRequestId,
    context: {
      actor: input.actor,
      occurredAt: input.now(),
      causationId: previewInput.requestState.initialSentEventId ?? previewInput.requestState.requestCreatedEventId,
      correlationId: `corr_${input.runId}_prr_followup_drafted`,
      coreVersion: "0.1.0",
      packVersions: { core: "0.1.0", prr: "0.1.0", agent: "0.1.0" }
    },
    payload: {
      prrRequestId: input.prrRequestId,
      correspondenceId: input.correspondenceId,
      subject: previewInput.message.subject,
      bodyHash: previewInput.message.renderedBodyHash,
      citedRules: citedRulesForDraft(previewInput, citedRuleRefs)
    }
  };
  return await input.ledger.append(event);
}

function citedRulesForDraft(
  previewInput: PrrNegotiationFollowUpApprovalPreviewInput,
  citedRuleRefs: readonly string[]
) {
  const projectedRules = previewInput.requestState.legalEscalation?.citedRules
    ?? previewInput.requestState.activeDeadline?.citedRules
    ?? [];
  if (projectedRules.length > 0) {
    return projectedRules.map((rule) => ({ ...rule, jurisdictionPack: { ...rule.jurisdictionPack } }));
  }
  return citedRuleRefs.map((ref) => ({
    jurisdictionPack: { ...previewInput.requestState.jurisdictionPack },
    label: ref,
    citation: ref
  }));
}
