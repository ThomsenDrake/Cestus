import type { PromptArtifactEnvelope } from "./prompt-artifacts.js";

export interface ProductionSpecialistInvocationProof {
  readonly purpose: "production-specialist-runtime-invocation";
}

interface InvocationBinding {
  readonly runId: string;
  readonly taskId: string;
  readonly providerId: string;
  readonly modelFamily: string;
  readonly credentialRefId: string;
  readonly inputArtifactHash: string;
  readonly promptArtifact: PromptArtifactEnvelope;
  consumed: boolean;
}

const bindings = new WeakMap<ProductionSpecialistInvocationProof, InvocationBinding>();

export function mintProductionSpecialistInvocationProof(input: Omit<InvocationBinding, "consumed">): ProductionSpecialistInvocationProof {
  const proof = Object.freeze({ purpose: "production-specialist-runtime-invocation" as const });
  bindings.set(proof, { ...input, consumed: false });
  return proof;
}

export function consumeProductionSpecialistInvocationProof(input: Omit<InvocationBinding, "consumed"> & {
  readonly proof: ProductionSpecialistInvocationProof | undefined;
}): boolean {
  if (input.proof === undefined) return false;
  const binding = bindings.get(input.proof);
  if (
    binding === undefined ||
    binding.consumed ||
    binding.runId !== input.runId ||
    binding.taskId !== input.taskId ||
    binding.providerId !== input.providerId ||
    binding.modelFamily !== input.modelFamily ||
    binding.credentialRefId !== input.credentialRefId ||
    binding.inputArtifactHash !== input.inputArtifactHash ||
    binding.promptArtifact !== input.promptArtifact
  ) {
    return false;
  }
  binding.consumed = true;
  return true;
}
