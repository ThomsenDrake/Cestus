import {
  createAgentRuntime,
  createContextPackRegistry,
  specialistWorkflowDescriptorFor,
  type AgentApprovedToolExecutorDescriptor,
  type AgentTaskOrchestratorRuntimeCapabilities
} from "../../agent/src/index.js";
import type { ActorRef } from "../../ontology/src/contracts.js";
import { createTaskOrchestratorProviderApprovalAdapter } from "../../agent/src/task-orchestrator-approval.js";
import { createTaskOrchestratorHandoffCapability } from "../../agent/src/task-orchestrator.js";
import { createLocalAgentProviderConfiguration } from "./agent-provider-readiness.js";
import type { LocalRuntimeHandle } from "./runtime-factory.js";

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
    taskOrchestratorCapabilities: createLocalTaskOrchestratorCapabilities(configuredProviders)
  });
};

function createLocalTaskOrchestratorCapabilities(
  configuredProviders: ReturnType<typeof createLocalAgentProviderConfiguration>
): AgentTaskOrchestratorRuntimeCapabilities {
  return Object.freeze({
    schemaVersion: "agent-task-orchestrator-runtime-capabilities.v1",
    workflowRegistry: { require: specialistWorkflowDescriptorFor },
    contextRegistry: createContextPackRegistry(),
    promptRendererRegistry: {
      render() {
        throw new Error("Local task orchestrator prompt rendering requires an approved provider run binding.");
      }
    },
    providerRegistry: configuredProviders.readinessRegistry,
    approvalReader: createTaskOrchestratorProviderApprovalAdapter(),
    runnerRegistry: {
      async dispatch() {
        throw new Error("Local task orchestrator specialist runner is not configured for autonomous dispatch.");
      }
    },
    handoffCapability: createTaskOrchestratorHandoffCapability()
  });
}
