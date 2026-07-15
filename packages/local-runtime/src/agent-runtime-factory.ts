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
  const mountedReadbacks = new Map<string, MountedProductionPromptReadbackWitness>();
  return Object.freeze({
    schemaVersion: "agent-task-orchestrator-runtime-capabilities.v1",
    workflowRegistry: { require: specialistWorkflowDescriptorFor },
    contextRegistry,
    promptRendererRegistry: {
      async render(input) {
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
          authoritativeResolvedContextPacks: input.resolvedContextPacks,
          taskId: input.taskId,
          attemptId: input.attemptId,
          runType: input.runType,
          generatedAt: input.generatedAt,
          scope: input.scope
        });
        if (readback.witness === undefined) {
          throw new Error("Local task orchestrator requires mounted v1 prompt readback authority.");
        }
        mountedReadbacks.set(`${input.taskId}:${input.attemptId}`, readback.witness);
        return readback.envelope;
      }
    },
    providerRegistry: configuredProviders.readinessRegistry,
    approvalReader: createTaskOrchestratorProviderApprovalAdapter(),
    runnerRegistry: {
      async dispatch(input) {
        // Task133.5 stops at the pre-approval mounted readback boundary. The
        // later owned admission runner consumes the lexical witness; it must
        // never ask a kernel to render a replacement prompt.
        const witness = mountedReadbacks.get(`${input.taskId}:${input.attemptId}`);
        if (witness === undefined) {
          throw new Error("Local task orchestrator requires the exact mounted context-ready prompt readback.");
        }
        // Keep the exact one-use witness lexical until the later owned
        // admission runner receives it. Do not serialize or reconstruct it.
        void witness;
        throw new Error("Local task orchestrator specialist runner is not configured for autonomous dispatch.");
      }
    },
    handoffCapability: createTaskOrchestratorHandoffCapability()
  });
}
