import {
  bindApprovedProductionSpecialistPromptV2,
  isProductionSpecialistPromptArtifactRendererVerified,
  type BindApprovedProductionSpecialistPromptV2Input
} from "../../agent/src/production-specialist-prompts.js";
import {
  createPromptArtifactExactRunBindingV2,
  type PromptArtifactEnvelope
} from "../../agent/src/prompt-artifacts.js";
import { specialistWorkflowDescriptorFor } from "../../agent/src/specialist-workflows.js";

/**
 * Binds one registered, renderer-verified V1 prompt to canonical exact-run
 * and provider-posture facts. Runtime admission remains a later factory-owned
 * concern; this adapter never invokes a provider or exposes prompt bytes.
 */
export function renderExactlyBoundProductionSpecialistPrompt(
  rawInput: BindApprovedProductionSpecialistPromptV2Input
): PromptArtifactEnvelope {
  try {
    const input = canonicalBindingInput(rawInput);
    if (!isProductionSpecialistPromptArtifactRendererVerified(input.approvedPromptArtifact)) {
      throw new Error("unverified-approved-prompt");
    }
    return bindApprovedProductionSpecialistPromptV2(input);
  } catch {
    throw new Error("prompt-binding-invalid");
  }
}

function canonicalBindingInput(input: BindApprovedProductionSpecialistPromptV2Input): BindApprovedProductionSpecialistPromptV2Input {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("invalid-prompt-binding");
  }
  const expected = ["approvedPromptArtifact", "generatedAt", "scope", "resolvedContextPacks", "exactRun"];
  const keys = Reflect.ownKeys(input);
  if (keys.length !== expected.length || keys.some((key) => typeof key !== "string" || !expected.includes(key))) {
    throw new Error("invalid-prompt-binding");
  }
  for (const key of expected) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
      throw new Error("invalid-prompt-binding");
    }
  }
  const canonicalExactRun = createPromptArtifactExactRunBindingV2(input.exactRun);
  return Object.freeze({
    approvedPromptArtifact: input.approvedPromptArtifact,
    generatedAt: input.generatedAt,
    scope: input.scope,
    resolvedContextPacks: input.resolvedContextPacks,
    exactRun: Object.freeze({
      taskId: canonicalExactRun.taskId,
      attemptId: canonicalExactRun.attemptId,
      approvedRunId: canonicalExactRun.approvedRunId,
      runId: canonicalExactRun.runId,
      runType: canonicalExactRun.runType,
      residentAgentId: canonicalExactRun.residentAgentId,
      workspaceId: canonicalExactRun.workspaceId,
      mountInstanceId: canonicalExactRun.mountInstanceId,
      workflowDescriptor: specialistWorkflowDescriptorFor(canonicalExactRun.runType),
      policyVersion: canonicalExactRun.policyVersion,
      providerPosture: canonicalExactRun.providerPosture
    })
  });
}
