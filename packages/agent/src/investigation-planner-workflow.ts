import { z } from "zod";
import { assertAgentSecretSafeText } from "./secret-safety.js";
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
  governanceLockIsActive,
  invokeSpecialistModel,
  prepareSpecialistRun,
  writeSpecialistDerivativeArtifact,
  type SpecialistRunnerBaseInput
} from "./specialist-runner-kernel.js";

const safeModelText = z.string().min(1).max(500).superRefine((value, ctx) => {
  try { assertAgentSecretSafeText(value, "investigation planner model output"); } catch { ctx.addIssue({ code: "custom", message: "model output must be secret-safe" }); }
});
const outputSchema = z.object({
  planSummary: safeModelText,
  taskSuggestions: z.array(safeModelText).min(1).max(12),
  prrDraftCandidates: z.array(safeModelText).min(1).max(12)
}).strict();

export interface RunInvestigationPlannerWorkflowInput extends SpecialistRunnerBaseInput {
  readonly investigationId?: string;
}

export interface RunInvestigationPlannerWorkflowResult {
  readonly handoff: LegacySpecialistWorkflowHandoffDto;
  readonly eventIds: readonly string[];
}

export async function runInvestigationPlannerWorkflow(
  input: RunInvestigationPlannerWorkflowInput
): Promise<RunInvestigationPlannerWorkflowResult> {
  if (input.investigationId === undefined) {
    return blockedHandoff(input, "Investigation scope is required before planning can begin.");
  }
  assertSpecialistDerivativeStoreAvailable(input);
  await assertSpecialistStepNotRecorded(input.ledger, input.runId, "step_investigation_planner_local_artifacts");
  const prepared = await prepareSpecialistRun(input, "investigation-planner");
  if (governanceLockIsActive(prepared.contextPackRefs)) {
    return blockedHandoff(input, "Active governance lock blocks investigation planning.", prepared.contextPackRefs);
  }

  const invocationId = `inv_${input.runId}_investigation_planner`;
  const invocation = await invokeSpecialistModel(input, prepared, invocationId);
  const output = parseModelOutput(invocation.outputText);
  if (output === undefined) {
    return await failedModelOutputResult(input, prepared, invocation.eventIds);
  }
  let planArtifact: Awaited<ReturnType<typeof writeSpecialistDerivativeArtifact>>;
  let tasksArtifact: Awaited<ReturnType<typeof writeSpecialistDerivativeArtifact>>;
  let draftsArtifact: Awaited<ReturnType<typeof writeSpecialistDerivativeArtifact>>;
  try {
    planArtifact = await writeSpecialistDerivativeArtifact({
      derivativeStore: input.derivativeStore,
      artifactKind: "investigation-plan-artifact",
      payload: {
        schemaVersion: "investigation-planner-handoff.v1",
        artifactKind: "investigation-plan-artifact",
        runId: input.runId,
        taskId: input.taskId,
        investigationId: input.investigationId,
        planSummary: output.planSummary
      }
    });
    tasksArtifact = await writeSpecialistDerivativeArtifact({
      derivativeStore: input.derivativeStore,
      artifactKind: "task-suggestion-bundle",
      payload: {
        schemaVersion: "investigation-planner-handoff.v1",
        artifactKind: "task-suggestion-bundle",
        runId: input.runId,
        taskId: input.taskId,
        investigationId: input.investigationId,
        taskSuggestions: [...output.taskSuggestions]
      }
    });
    draftsArtifact = await writeSpecialistDerivativeArtifact({
      derivativeStore: input.derivativeStore,
      artifactKind: "draft-prr-candidate-bundle",
      payload: {
        schemaVersion: "investigation-planner-handoff.v1",
        artifactKind: "draft-prr-candidate-bundle",
        runId: input.runId,
        taskId: input.taskId,
        investigationId: input.investigationId,
        prrDraftCandidates: [...output.prrDraftCandidates]
      }
    });
  } catch {
    return await failedDerivativeArtifactResult(input, prepared, invocation.eventIds);
  }
  const planHash = planArtifact.artifactHash;
  const tasksHash = tasksArtifact.artifactHash;
  const draftsHash = draftsArtifact.artifactHash;
  const step = await appendSpecialistDerivativeStep({
    ledger: input.ledger, actor: input.actor, now: input.now, runId: input.runId,
    stepId: "step_investigation_planner_local_artifacts", invocationId,
    summary: "Created local investigation plan, task suggestions, and PRR draft candidates for review.",
    inputArtifactHashes: [prepared.promptArtifact.manifest.inputArtifactHash, invocation.outputArtifactHash],
    outputArtifactHashes: [planHash, tasksHash, draftsHash]
  });
  const completed = await appendSpecialistCompletion({
    ledger: input.ledger, actor: input.actor, now: input.now, runId: input.runId,
    summary: "Investigation planning artifacts are ready for review; no external action was requested.",
    outputArtifactHashes: [planHash, tasksHash, draftsHash], relatedEventIds: [step.id]
  });
  const handoff = parseLegacySpecialistWorkflowHandoff({
    schemaVersion: "agent-specialist-handoff.v1", runType: "investigation-planner", runId: input.runId, taskId: input.taskId,
    residentAgentId: "agent_default", generatedAt: input.now(), status: "ready-for-review",
    safeSummary: "Investigation plan, local task suggestions, and PRR draft candidates are ready for review.",
    contextPackRefs: prepared.contextPackRefs, promptArtifactHash: prepared.promptArtifact.manifest.inputArtifactHash,
    outputArtifacts: [
      { artifactId: `artifact_${input.runId}_plan`, artifactKind: "investigation-plan-artifact", schemaId: "investigation-planner-handoff.v1", artifactHash: planHash, safeSummary: "Local investigation plan artifact hash is ready for review." },
      { artifactId: `artifact_${input.runId}_tasks`, artifactKind: "task-suggestion-bundle", schemaId: "investigation-planner-handoff.v1", artifactHash: tasksHash, safeSummary: "Local task suggestions require investigator review." },
      { artifactId: `artifact_${input.runId}_prr_drafts`, artifactKind: "draft-prr-candidate-bundle", schemaId: "investigation-planner-handoff.v1", artifactHash: draftsHash, safeSummary: "Local PRR draft candidates have not been sent." }
    ],
    toolRequestIds: [], approvalRequirements: [],
    nextSafeActions: [{ actionId: `action_${input.runId}_review`, label: "Review the investigation planning artifacts", kind: "review", effect: "none", artifactId: `artifact_${input.runId}_plan` }]
  });
  return Object.freeze({
    handoff,
    eventIds: Object.freeze([...invocation.eventIds, step.id, completed.id])
  });
}

function blockedHandoff(
  input: RunInvestigationPlannerWorkflowInput,
  summary: string,
  contextPackRefs: readonly import("./context-packs.js").ContextPackRef[] = []
): RunInvestigationPlannerWorkflowResult {
  const handoff = parseLegacySpecialistWorkflowHandoff({
    schemaVersion: "agent-specialist-handoff.v1", runType: "investigation-planner", runId: input.runId, taskId: input.taskId,
    residentAgentId: "agent_default", generatedAt: input.now(), status: "blocked", safeSummary: summary,
    contextPackRefs, outputArtifacts: [], toolRequestIds: [], approvalRequirements: [],
    nextSafeActions: [{ actionId: `action_${input.runId}_inspect`, label: "Inspect investigation scope and governance status", kind: "inspect", effect: "none" }]
  });
  return Object.freeze({ handoff, eventIds: Object.freeze([]) });
}

function parseModelOutput(outputText: string): z.infer<typeof outputSchema> | undefined {
  try {
    return outputSchema.parse(JSON.parse(outputText));
  } catch {
    return undefined;
  }
}

async function failedModelOutputResult(
  input: RunInvestigationPlannerWorkflowInput,
  prepared: Awaited<ReturnType<typeof prepareSpecialistRun>>,
  invocationEventIds: readonly string[]
): Promise<RunInvestigationPlannerWorkflowResult> {
  const failed = await appendSpecialistFailure({
    ledger: input.ledger,
    actor: input.actor,
    now: input.now,
    runId: input.runId,
    category: "model-output-invalid",
    message: "Investigation planner model output did not match the required structured schema.",
    retryable: true,
    allowedActions: ["retry with a provider that returns the approved investigation planner schema"],
    ...(invocationEventIds.at(-1) === undefined ? {} : { causationId: invocationEventIds.at(-1) })
  });
  const handoff = parseLegacySpecialistWorkflowHandoff({
    schemaVersion: "agent-specialist-handoff.v1",
    runType: "investigation-planner",
    runId: input.runId,
    taskId: input.taskId,
    residentAgentId: "agent_default",
    generatedAt: input.now(),
    status: "failed",
    safeSummary: "Investigation planning could not produce valid structured artifacts.",
    contextPackRefs: prepared.contextPackRefs,
    promptArtifactHash: prepared.promptArtifact.manifest.inputArtifactHash,
    outputArtifacts: [],
    toolRequestIds: [],
    approvalRequirements: [],
    nextSafeActions: [{
      actionId: `action_${input.runId}_retry_model`,
      label: "Retry investigation planner model output",
      kind: "retry",
      effect: "none"
    }],
    failure: {
      category: "model-output-invalid",
      code: "investigation-planner-model-output-invalid",
      safeSummary: "Model output failed investigation planner schema validation.",
      retryable: true
    }
  });
  return Object.freeze({ handoff, eventIds: Object.freeze([...invocationEventIds, failed.id]) });
}

async function failedDerivativeArtifactResult(
  input: RunInvestigationPlannerWorkflowInput,
  prepared: Awaited<ReturnType<typeof prepareSpecialistRun>>,
  invocationEventIds: readonly string[]
): Promise<RunInvestigationPlannerWorkflowResult> {
  const failed = await appendSpecialistFailure({
    ledger: input.ledger,
    actor: input.actor,
    now: input.now,
    runId: input.runId,
    category: "external-effect-failed",
    message: "Investigation planner derivative artifact storage failed before ledger publication.",
    retryable: true,
    allowedActions: ["inspect local derivative artifact storage and retry investigation planning"],
    ...(invocationEventIds.at(-1) === undefined ? {} : { causationId: invocationEventIds.at(-1) })
  });
  const handoff = parseLegacySpecialistWorkflowHandoff({
    schemaVersion: "agent-specialist-handoff.v1",
    runType: "investigation-planner",
    runId: input.runId,
    taskId: input.taskId,
    residentAgentId: "agent_default",
    generatedAt: input.now(),
    status: "failed",
    safeSummary: "Investigation planning could not publish local derivative artifacts.",
    contextPackRefs: prepared.contextPackRefs,
    promptArtifactHash: prepared.promptArtifact.manifest.inputArtifactHash,
    outputArtifacts: [],
    toolRequestIds: [],
    approvalRequirements: [],
    nextSafeActions: [{
      actionId: `action_${input.runId}_retry_storage`,
      label: "Retry investigation planning after derivative storage is healthy",
      kind: "retry",
      effect: "none"
    }],
    failure: {
      category: "external-effect-failed",
      code: "investigation-planner-derivative-storage-failed",
      safeSummary: "Derivative artifact storage failed before any specialist step or tool request was recorded.",
      retryable: true
    }
  });
  return Object.freeze({ handoff, eventIds: Object.freeze([...invocationEventIds, failed.id]) });
}
