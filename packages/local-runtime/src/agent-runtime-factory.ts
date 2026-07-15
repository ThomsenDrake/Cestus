import {
  createAgentRuntime,
  createContextPackRegistry,
  lookupInvestigativeContextPackRegistrarEvidence,
  lookupOperationalContextPackRegistrarEvidence,
  lookupPrrContextPackRegistrarEvidence,
  renderProductionSpecialistPrompt,
  specialistWorkflowDescriptorFor,
  type AgentApprovedToolExecutorDescriptor,
  type AgentTaskOrchestratorRuntimeCapabilities,
  type ContextPackRegistry
} from "../../agent/src/index.js";
import type { ActorRef } from "../../ontology/src/contracts.js";
import { createTaskOrchestratorProviderApprovalAdapter } from "../../agent/src/task-orchestrator-approval.js";
import { createTaskOrchestratorHandoffCapability } from "../../agent/src/task-orchestrator.js";
import { createLocalAgentProviderConfiguration } from "./agent-provider-readiness.js";
import { createMountedPromptArtifactStore } from "./mounted-prompt-artifact-store.js";
import type { LocalRuntimeHandle } from "./runtime-factory.js";
import type { MountedProductionPromptReadbackWitness } from "../../agent/src/production-prompt-readback.js";
import type { PromptArtifactEnvelope } from "../../agent/src/prompt-artifacts.js";

export interface LocalAgentRuntimeFactoryInput {
  readonly handle: LocalRuntimeHandle;
  readonly actor: ActorRef;
  readonly now: () => string;
  readonly approvedToolExecutors?: readonly AgentApprovedToolExecutorDescriptor[];
}

export type LocalAgentRuntimeFactory = (
  input: LocalAgentRuntimeFactoryInput
) => ReturnType<typeof createAgentRuntime>;

export const defaultLocalAgentRuntimeFactory: LocalAgentRuntimeFactory = (input) => {
  const contextRegistry = createContextPackRegistry();
  const verifyFactoryHeldContextBindings = createFactoryHeldContextBindingVerifier(contextRegistry);
  const configuredProviders = createLocalAgentProviderConfiguration({
    cwd: input.handle.config.cwd,
    now: input.now
  });

  return createAgentRuntime({
    ledger: input.handle.ledger,
    actor: input.actor,
    now: input.now,
    identityLifecycle: () => input.handle.residentIdentity.lifecycle(),
    identityLifecycleReady: () => input.handle.residentIdentity.ready(),
    providers: configuredProviders.providers,
    approvedToolExecutors: input.approvedToolExecutors ?? [],
    taskOrchestratorCapabilities: createLocalTaskOrchestratorCapabilities(configuredProviders, contextRegistry, input.handle)
  });
};

type FactoryHeldRegistrarEvidence =
  | NonNullable<ReturnType<typeof lookupPrrContextPackRegistrarEvidence>>
  | NonNullable<ReturnType<typeof lookupOperationalContextPackRegistrarEvidence>>
  | NonNullable<ReturnType<typeof lookupInvestigativeContextPackRegistrarEvidence>>;

/**
 * This closure is deliberately lexical to the factory. Task132A records the
 * exact package-owned registrar identities but exposes no capability or way
 * for an external caller to capture, consume, or supply them. Task140R0 is
 * the first authorized owner that can close this verifier into a real port.
 */
function createFactoryHeldContextBindingVerifier(contextRegistry: ContextPackRegistry): () => void {
  const descriptors = contextRegistry.listDescriptors();
  if (descriptors.length === 0) {
    throw new Error("blocked.factory-context-attestation-required");
  }

  const captured = new Map<string, FactoryHeldRegistrarEvidence>();
  for (const descriptor of descriptors) {
    const evidence = packageOwnedRegistrarEvidence(contextRegistry, descriptor.contextPackId);
    if (evidence === undefined || captured.has(descriptor.contextPackId)) {
      throw new Error("blocked.factory-context-attestation-required");
    }
    captured.set(descriptor.contextPackId, Object.freeze({ ...evidence }));
  }

  return () => {
    const currentDescriptors = contextRegistry.listDescriptors();
    if (currentDescriptors.length !== captured.size) {
      throw new Error("blocked.factory-context-attestation-required");
    }
    for (const descriptor of currentDescriptors) {
      const capturedEvidence = captured.get(descriptor.contextPackId);
      const currentEvidence = packageOwnedRegistrarEvidence(contextRegistry, descriptor.contextPackId);
      if (capturedEvidence === undefined || currentEvidence === undefined ||
        capturedEvidence.descriptorHash !== currentEvidence.descriptorHash ||
        capturedEvidence.parserIdentity !== currentEvidence.parserIdentity ||
        capturedEvidence.producerIdentity !== currentEvidence.producerIdentity ||
        capturedEvidence.registrationIdentity !== currentEvidence.registrationIdentity) {
        throw new Error("blocked.factory-context-attestation-required");
      }
    }
  };
}

function packageOwnedRegistrarEvidence(
  contextRegistry: ContextPackRegistry,
  contextPackId: string
): FactoryHeldRegistrarEvidence | undefined {
  const evidence = [
    lookupPrrContextPackRegistrarEvidence(contextRegistry, contextPackId),
    lookupOperationalContextPackRegistrarEvidence(contextRegistry, contextPackId),
    lookupInvestigativeContextPackRegistrarEvidence(contextRegistry, contextPackId)
  ].filter((candidate): candidate is FactoryHeldRegistrarEvidence => candidate !== undefined);
  return evidence.length === 1 ? evidence[0] : undefined;
}

function createLocalTaskOrchestratorCapabilities(
  configuredProviders: ReturnType<typeof createLocalAgentProviderConfiguration>,
  contextRegistry: ReturnType<typeof createContextPackRegistry>,
  handle: LocalRuntimeHandle
): AgentTaskOrchestratorRuntimeCapabilities {
  let mountedStore: ReturnType<typeof createMountedPromptArtifactStore> | undefined;
  const storeForRender = (): ReturnType<typeof createMountedPromptArtifactStore> => {
    mountedStore ??= createMountedPromptArtifactStore({ handle });
    return mountedStore;
  };
  // This remains lexical to the local factory. Later runner composition can
  // consume only an exact witness placed here by the post-readback renderer.
  const mountedReadbacks = new Map<string, {
    readonly witness: MountedProductionPromptReadbackWitness;
    readonly envelope: PromptArtifactEnvelope;
    readonly revalidateCurrent: () => Promise<void>;
  }>();
  return Object.freeze({
    schemaVersion: "agent-task-orchestrator-runtime-capabilities.v1",
    workflowRegistry: { require: specialistWorkflowDescriptorFor },
    contextRegistry,
    promptRendererRegistry: {
      async render(input: Parameters<AgentTaskOrchestratorRuntimeCapabilities["promptRendererRegistry"]["render"]>[0]) {
        if (input.runType === "ontology-bootstrap") {
          throw new Error("Local task orchestrator production prompt rendering does not support ontology-bootstrap.");
        }
        const artifact = renderProductionSpecialistPrompt({
          taskId: input.taskId,
          runId: input.attemptId,
          runType: input.runType,
          generatedAt: input.generatedAt,
          scope: input.scope,
          resolvedContextPacks: input.resolvedContextPacks
        });
        const store = await storeForRender();
        await store.put(artifact);
        const readback = await store.read({
          inputArtifactHash: artifact.manifest.inputArtifactHash as `sha256:${string}`,
          authoritativeResolvedContextPacks: input.resolvedContextPacks
        });
        const witness = readback.witness;
        const revalidateCurrent = readback.revalidateCurrent;
        if (witness === undefined || revalidateCurrent === undefined) {
          throw new Error("Local task orchestrator requires mounted v1 prompt readback authority.");
        }
        mountedReadbacks.set(`${input.taskId}:${input.attemptId}`, {
          witness,
          envelope: readback.envelope,
          revalidateCurrent
        });
        return readback.envelope;
      },
      async readback(input: { readonly taskId: string; readonly attemptId: string }, rendered: unknown) {
        const readback = mountedReadbacks.get(`${input.taskId}:${input.attemptId}`);
        if (readback === undefined || readback.envelope !== rendered) {
          throw new Error("Local task orchestrator requires exact mounted prompt readback before context-ready.");
        }
        // Retain the opaque witness only in this closure. The orchestrator
        // invokes it after its final context-ready stream read and immediately
        // before append; no mount/authority facts cross the package boundary.
        return Object.freeze({
          inputArtifactHash: readback.envelope.manifest.inputArtifactHash,
          revalidateAfterFinalLedgerRead: readback.revalidateCurrent
        });
      }
    },
    providerRegistry: configuredProviders.readinessRegistry,
    approvalReader: createTaskOrchestratorProviderApprovalAdapter(),
    runnerRegistry: {
      async dispatch(input: Parameters<AgentTaskOrchestratorRuntimeCapabilities["runnerRegistry"]["dispatch"]>[0]) {
        // Task133.5 stops at the pre-approval mounted readback boundary. The
        // later owned admission runner consumes the lexical witness; it must
        // never ask a kernel to render a replacement prompt.
        const key = `${input.taskId}:${input.attemptId}`;
        const retained = mountedReadbacks.get(key);
        const readback = retained ?? await recoverMountedContextReadyWitness({
          handle,
          contextRegistry,
          store: await storeForRender(),
          taskId: input.taskId,
          runType: input.runType,
          attemptId: input.attemptId
        });
        // Keep the exact one-use witness lexical until the later owned
        // admission runner receives it. Do not serialize or reconstruct it.
        void readback.witness;
        throw new Error("Local task orchestrator specialist runner is not configured for autonomous dispatch.");
      }
    },
    handoffCapability: createTaskOrchestratorHandoffCapability()
  });
}

async function recoverMountedContextReadyWitness(input: {
  readonly handle: LocalRuntimeHandle;
  readonly contextRegistry: ContextPackRegistry;
  readonly store: Awaited<ReturnType<typeof createMountedPromptArtifactStore>>;
  readonly taskId: string;
  readonly runType: string;
  readonly attemptId: string;
}): Promise<{ readonly witness: MountedProductionPromptReadbackWitness; readonly envelope: PromptArtifactEnvelope }> {
  const events = await input.handle.ledger.readStream(`agent_task_orchestration_${input.taskId}_${input.runType}`);
  const checkpoint = events.findLast((event) => {
    if (event.type !== "agent.task.orchestration.checkpointed") return false;
    const payload = event.payload;
    return payload.checkpointKind === "context-ready" &&
      payload.taskId === input.taskId && payload.runType === input.runType &&
      payload.attemptId === input.attemptId && typeof payload.promptArtifactHash === "string";
  });
  if (checkpoint === undefined || checkpoint.type !== "agent.task.orchestration.checkpointed") {
    throw new Error("Local task orchestrator requires a durable context-ready mounted prompt checkpoint.");
  }
  const durableContextBindings = checkpoint.payload.contextBindings;
  const contextPackIds = durableContextBindings.map((binding) => binding.contextPackId);
  if (contextPackIds.length === 0 || new Set(contextPackIds).size !== contextPackIds.length) {
    throw new Error("Local task orchestrator context-ready checkpoint has invalid context bindings.");
  }
  const authoritativeResolvedContextPacks = await Promise.all(
    contextPackIds.map(async (contextPackId) => await input.contextRegistry.buildResolved(contextPackId))
  );
  for (const [index, resolved] of authoritativeResolvedContextPacks.entries()) {
    const durable = durableContextBindings[index];
    const authoritativeProvenanceEventIds = (resolved.ref.sourceEventIds ?? resolved.ref.provenanceRefs)
      .filter((value) => value.startsWith("evt_"));
    if (
      durable === undefined ||
      resolved.ref.contextPackId !== durable.contextPackId ||
      resolved.ref.contentHash !== durable.contentHash ||
      resolved.ref.sizeBytes !== durable.sizeBytes ||
      resolved.ref.contextPackId !== durable.schemaId ||
      authoritativeProvenanceEventIds.length !== durable.provenanceEventIds.length ||
      authoritativeProvenanceEventIds.some((eventId, provenanceIndex) =>
        eventId !== durable.provenanceEventIds[provenanceIndex]
      )
    ) {
      throw new Error("Local task orchestrator context-ready checkpoint no longer matches current canonical context pack readback.");
    }
  }
  const readback = await input.store.read({
    inputArtifactHash: checkpoint.payload.promptArtifactHash as `sha256:${string}`,
    authoritativeResolvedContextPacks
  });
  if (readback.witness === undefined) {
    throw new Error("Local task orchestrator durable context-ready artifact is not a mounted V1 prompt.");
  }
  return Object.freeze({ witness: readback.witness, envelope: readback.envelope });
}
