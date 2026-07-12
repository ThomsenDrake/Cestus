import {
  assertResolvedContextPacksForExecution,
  serializeContextPackPayload,
  type ContextPackRef,
  type ResolvedContextPack,
  type VerifiedResolvedContextPack
} from "./context-packs.js";
import {
  evaluateProductionContextRequirements,
  productionSpecialistPromptRegistrationFor
} from "./production-specialist-prompts.js";
import { specialistWorkflowDescriptorFor } from "./specialist-workflows.js";
import type {
  AssembleTaskOrchestratorContextInput,
  TaskOrchestratorContextAssembly,
  TaskOrchestratorContextBinding,
  TaskOrchestratorContextDiagnostic,
  TaskOrchestratorInapplicableContextPack
} from "./task-orchestrator-types.js";

/**
 * Resolves registered context only after workflow applicability is known. The
 * returned verified packs stay local to prompt rendering; durable/UI metadata
 * contains only their content-addressed bindings.
 */
export async function assembleTaskOrchestratorContext(
  input: AssembleTaskOrchestratorContextInput
): Promise<TaskOrchestratorContextAssembly> {
  const canonicalWorkflow = specialistWorkflowDescriptorFor(input.runType);
  if (input.workflow !== canonicalWorkflow) {
    throw new Error("Task orchestrator requires the canonical registered workflow descriptor");
  }
  const registration = productionSpecialistPromptRegistrationFor(canonicalWorkflow.runType);

  const applicableRefs: ContextPackRef[] = [];
  const resolvedPacks: VerifiedResolvedContextPack[] = [];
  const hasAssociatedPrr = input.scope.associatedPrrRequestId !== undefined;

  for (const requirement of registration.contextRequirements) {
    const applicable = requirement.requirementMode === "always" || hasAssociatedPrr;
    if (!applicable) {
      continue;
    }

    const descriptor = input.contextRegistry.getDescriptor(requirement.contextPackId);
    if (descriptor === undefined) {
      throw new Error(`Context pack ${requirement.contextPackId} is not registered`);
    }
    const locallyResolved = await input.contextRegistry.buildResolved(requirement.contextPackId);
    const locallyVerified = assertLocallyVerifiedContextPack(locallyResolved);
    assertResolvedPackMatchesDescriptor(locallyVerified, descriptor.contextPackId, descriptor.version, descriptor.maxBytes);
    const verified = assertSingleVerifiedContextPack(locallyVerified.ref, locallyVerified);

    applicableRefs.push(verified.ref);
    resolvedPacks.push(verified);
  }

  // This operational assertion rejects ref-only, deserialized, and caller-forged readiness objects.
  const verifiedResolvedContextPacks = assertResolvedContextPacksForExecution(applicableRefs, resolvedPacks);
  const evaluatedContext = evaluateProductionContextRequirements({
    runType: canonicalWorkflow.runType,
    taskId: input.taskId,
    scope: input.scope,
    resolvedContextPacks: verifiedResolvedContextPacks
  });
  const inapplicable = Object.freeze(evaluatedContext.requirements
    .filter((requirement) => requirement.status === "not-applicable")
    .map((requirement) => Object.freeze({
      contextPackId: requirement.contextPackId,
      reason: "no-associated-prr" as const
    } satisfies TaskOrchestratorInapplicableContextPack)));
  const diagnostics = Object.freeze(evaluatedContext.requirements.map((requirement) => {
    if (requirement.status === "not-applicable") {
      return Object.freeze({
        contextPackId: requirement.contextPackId,
        status: "not-applicable" as const,
        reason: "no-associated-prr" as const
      } satisfies TaskOrchestratorContextDiagnostic);
    }
    return Object.freeze({
      contextPackId: requirement.contextPackId,
      status: "applicable" as const,
      contentHash: requirement.contentHash
    } satisfies TaskOrchestratorContextDiagnostic);
  }));
  if (input.renderPrompt !== undefined) {
    await input.renderPrompt(Object.freeze({
      taskId: input.taskId,
      runType: input.runType,
      scope: input.scope,
      workflow: canonicalWorkflow,
      resolvedContextPacks: verifiedResolvedContextPacks
    }));
  }

  const checkpointContextBindings = Object.freeze(verifiedResolvedContextPacks.map(contextBindingFor));
  return Object.freeze({
    dispatchReady: true,
    resolvedContextPacks: verifiedResolvedContextPacks,
    applicableContextPackRefs: Object.freeze([...applicableRefs]),
    inapplicable,
    diagnostics,
    checkpointContextBindings,
    cockpitContext: checkpointContextBindings,
    approvalPreview: Object.freeze({ contextBindings: checkpointContextBindings }),
    logRecord: Object.freeze({ contextBindings: checkpointContextBindings })
  });
}

/** Test helper: prove safe projection surfaces did not receive local payload bytes. */
export function assertTaskOrchestratorContextHasNoPayloadBytes(
  projectedValues: readonly unknown[],
  resolvedContextPacks: readonly VerifiedResolvedContextPack[]
): void {
  const projected = JSON.stringify(projectedValues);
  for (const resolved of resolvedContextPacks) {
    const payload = Buffer.from(serializeContextPackPayload(resolved.payload)).toString("utf8");
    if (projected.includes(payload)) {
      throw new Error(`Resolved payload bytes leaked for ${resolved.ref.contextPackId}`);
    }
  }
}

function assertSingleVerifiedContextPack(
  ref: ContextPackRef,
  locallyVerified: VerifiedResolvedContextPack
): VerifiedResolvedContextPack {
  const verified = assertResolvedContextPacksForExecution(
    [ref],
    [locallyVerified]
  );
  const first = verified[0];
  if (first === undefined) {
    throw new Error(`Context pack ${ref.contextPackId} did not resolve locally`);
  }
  return first;
}

function assertLocallyVerifiedContextPack(locallyResolved: unknown): VerifiedResolvedContextPack {
  if (typeof locallyResolved !== "object" || locallyResolved === null || !("ref" in locallyResolved)) {
    throw new Error("Context pack did not return a locally resolved payload");
  }
  const candidate = locallyResolved as ResolvedContextPack;
  const verified = assertResolvedContextPacksForExecution([candidate.ref], [candidate]);
  const first = verified[0];
  if (first === undefined) {
    throw new Error("Context pack did not return a locally verified payload");
  }
  return first;
}

function assertResolvedPackMatchesDescriptor(
  resolved: VerifiedResolvedContextPack,
  expectedContextPackId: string,
  expectedVersion: number,
  maxBytes: number
): void {
  if (resolved.ref.contextPackId !== expectedContextPackId || resolved.ref.version !== expectedVersion) {
    throw new Error(`Resolved context schema does not match descriptor ${expectedContextPackId}`);
  }
  if (resolved.ref.sizeBytes > maxBytes) {
    throw new Error(`Resolved context byte size exceeds descriptor budget for ${expectedContextPackId}`);
  }
}

function contextBindingFor(resolved: VerifiedResolvedContextPack): TaskOrchestratorContextBinding {
  return Object.freeze({
    contextPackId: resolved.ref.contextPackId,
    ref: resolved.ref,
    contentHash: resolved.ref.contentHash,
    byteLength: resolved.ref.sizeBytes,
    schemaId: resolved.ref.contextPackId,
    provenanceEventIds: Object.freeze((resolved.ref.sourceEventIds ?? resolved.ref.provenanceRefs)
      .filter((value) => value.startsWith("evt_")))
  });
}
