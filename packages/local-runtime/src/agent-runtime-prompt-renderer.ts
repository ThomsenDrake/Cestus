import {
  bindApprovedProductionSpecialistPromptV2,
  isProductionSpecialistPromptArtifactRendererVerified,
  verifyProductionSpecialistPromptArtifact,
  type BindApprovedProductionSpecialistPromptV2Input
} from "../../agent/src/production-specialist-prompts.js";
import {
  createPromptArtifactExactRunBindingV2,
  type PromptArtifactEnvelope
} from "../../agent/src/prompt-artifacts.js";
import type { VerifiedResolvedContextPack } from "../../agent/src/context-packs.js";
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
    verifyProductionSpecialistPromptArtifact({
      artifact: input.approvedPromptArtifact,
      taskId: input.exactRun.taskId,
      runId: input.exactRun.runId,
      runType: input.exactRun.runType,
      generatedAt: input.approvedPromptArtifact.manifest.generatedAt,
      scope: input.scope,
      resolvedContextPacks: input.resolvedContextPacks
    });
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
  const resolvedContextPacks = canonicalResolvedContextPacks(input.resolvedContextPacks);
  const canonicalExactRun = createPromptArtifactExactRunBindingV2(input.exactRun);
  return Object.freeze({
    approvedPromptArtifact: input.approvedPromptArtifact,
    generatedAt: input.generatedAt,
    scope: input.scope,
    resolvedContextPacks,
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

function canonicalResolvedContextPacks(
  resolvedContextPacks: readonly VerifiedResolvedContextPack[]
): readonly VerifiedResolvedContextPack[] {
  if (!Array.isArray(resolvedContextPacks) || Object.getPrototypeOf(resolvedContextPacks) !== Array.prototype) {
    throw new Error("invalid-resolved-context-packs");
  }
  if (Object.getOwnPropertySymbols(resolvedContextPacks).length !== 0) {
    throw new Error("invalid-resolved-context-packs");
  }
  const descriptors = Object.getOwnPropertyDescriptors(resolvedContextPacks);
  const length = Object.getOwnPropertyDescriptor(resolvedContextPacks, "length");
  if (length === undefined || length.enumerable || !("value" in length) || length.value !== resolvedContextPacks.length) {
    throw new Error("invalid-resolved-context-packs");
  }
  if (Object.getOwnPropertyNames(resolvedContextPacks).length !== resolvedContextPacks.length + 1) {
    throw new Error("invalid-resolved-context-packs");
  }
  for (let index = 0; index < resolvedContextPacks.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
      throw new Error("invalid-resolved-context-packs");
    }
  }
  return resolvedContextPacks;
}
