import { z } from "zod";
import type { AppendableKnowledgeEvent, KnowledgeEvent } from "../../ontology/src/contracts.js";
import {
  buildPrrCorrespondenceApprovalPreview,
  prrFollowUpExecuteDescriptor,
  type BuildPrrCorrespondencePreviewInput
} from "./adapters/prr-correspondence.js";
import { assertAgentSecretSafeText } from "./secret-safety.js";
import { createAgentToolGateway } from "./tool-gateway.js";
import { parseSpecialistWorkflowHandoff, type SpecialistWorkflowHandoffDto } from "./specialist-handoffs.js";
import {
  appendSpecialistDerivativeStep,
  appendSpecialistFailure,
  assertSpecialistStepNotRecorded,
  hashSpecialistLocalArtifact,
  invokeSpecialistModel,
  prepareSpecialistRun,
  type SpecialistRunnerBaseInput
} from "./specialist-runner-kernel.js";

const safeModelText = z.string().min(1).max(500).superRefine((value, ctx) => {
  try { assertAgentSecretSafeText(value, "PRR negotiation model output"); } catch { ctx.addIssue({ code: "custom", message: "model output must be secret-safe" }); }
});
const outputSchema = z.object({
  draftSummary: safeModelText,
  requestFollowUpApproval: z.boolean(),
  citedRuleRefs: z.array(safeModelText).max(12)
}).strict();

export interface RunPrrNegotiationWorkflowInput extends SpecialistRunnerBaseInput {
  readonly prrRequestId: string;
  readonly correspondenceId: string;
  readonly jurisdictionRuleRefs: readonly string[];
  readonly followUpApprovalPreview?: PrrNegotiationFollowUpApprovalPreviewInput;
}

export interface RunPrrNegotiationWorkflowResult {
  readonly handoff: SpecialistWorkflowHandoffDto;
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

export async function runPrrNegotiationWorkflow(
  input: RunPrrNegotiationWorkflowInput
): Promise<RunPrrNegotiationWorkflowResult> {
  await assertSpecialistStepNotRecorded(input.ledger, input.runId, "step_prr_negotiation_draft");
  if (input.followUpApprovalPreview === undefined) {
    throw new Error("PRR follow-up approval preview is required before running approval-capable PRR negotiation.");
  }
  const prepared = await prepareSpecialistRun(input, "prr-negotiation");
  const invocationId = `inv_${input.runId}_prr_negotiation`;
  const invocation = await invokeSpecialistModel(input, prepared, invocationId);
  const output = parseModelOutput(invocation.outputText);
  if (output === undefined) {
    return await failedModelOutputResult(input, prepared, invocation.eventIds);
  }
  const draftHash = hashSpecialistLocalArtifact({
    prrRequestId: input.prrRequestId,
    correspondenceId: input.correspondenceId,
    draftSummary: output.draftSummary,
    citedRuleRefs: output.citedRuleRefs
  });
  const draftStep = await appendSpecialistDerivativeStep({
    ledger: input.ledger, actor: input.actor, now: input.now, runId: input.runId,
    stepId: "step_prr_negotiation_draft", summary: "Created a local PRR correspondence draft for human review.",
    invocationId, inputArtifactHashes: [prepared.promptArtifact.manifest.inputArtifactHash, invocation.outputArtifactHash],
    outputArtifactHashes: [draftHash]
  });

  const toolRequestId = `toolreq_${input.runId}_followup`;
  const approval = output.requestFollowUpApproval
    ? await requestFollowUpApproval(input, toolRequestId, draftHash, output.citedRuleRefs)
    : undefined;
  const handoff = parseSpecialistWorkflowHandoff({
    schemaVersion: "agent-specialist-handoff.v1", runType: "prr-negotiation", runId: input.runId, taskId: input.taskId,
    residentAgentId: "agent_default", generatedAt: input.now(), status: approval === undefined ? "ready-for-review" : "waiting-for-approval",
    safeSummary: approval === undefined
      ? "PRR correspondence draft artifact is ready for human review."
      : "PRR correspondence draft artifact is ready for review and follow-up approval.",
    contextPackRefs: prepared.contextPackRefs, promptArtifactHash: prepared.promptArtifact.manifest.inputArtifactHash,
    outputArtifacts: [{ artifactId: `artifact_${input.runId}_draft`, artifactKind: "correspondence-draft-artifact", schemaId: "prr-negotiation-handoff.v1", artifactHash: draftHash, safeSummary: "Local PRR correspondence draft artifact hash is ready for human review." }],
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
      ...(approval === undefined ? [] : [approval.drafted.id, approval.requested.id])
    ])
  });
}

function parseModelOutput(outputText: string): z.infer<typeof outputSchema> | undefined {
  try {
    return outputSchema.parse(JSON.parse(outputText));
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
  const handoff = parseSpecialistWorkflowHandoff({
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

async function requestFollowUpApproval(
  input: RunPrrNegotiationWorkflowInput,
  toolRequestId: string,
  draftHash: `sha256:${string}`,
  citedRuleRefs: readonly string[]
): Promise<{ readonly drafted: KnowledgeEvent; readonly requested: KnowledgeEvent }> {
  if (input.followUpApprovalPreview === undefined) {
    throw new Error("PRR follow-up approval preview is required before requesting external-message-send approval.");
  }
  const drafted = await appendPrrFollowupDrafted(input, input.followUpApprovalPreview, citedRuleRefs);
  const preview = buildPrrCorrespondenceApprovalPreview({
    ...input.followUpApprovalPreview,
    toolRequestId,
    toolId: prrFollowUpExecuteDescriptor.toolId,
    toolVersion: prrFollowUpExecuteDescriptor.toolVersion,
    runId: input.runId,
    taskId: input.taskId,
    residentAgentId: "agent_default",
    prrRequestId: input.prrRequestId,
    correspondenceId: input.correspondenceId,
    messageSourceEventId: drafted.id
  });
  const gateway = createAgentToolGateway({ ledger: input.ledger, actor: input.actor, now: input.now });
  const requested = await gateway.requestTool({
    toolRequestId,
    residentAgentId: "agent_default",
    taskId: input.taskId,
    runId: input.runId,
    toolId: preview.toolId,
    toolVersion: preview.toolVersion,
    sideEffectClass: preview.sideEffectClass,
    requiredApprovalClass: "external-message-send",
    preview,
    inputArtifactHashes: [draftHash, ...(preview.artifactHashes ?? [])]
  });
  return Object.freeze({ drafted, requested });
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
