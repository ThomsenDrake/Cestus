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
import {
  captureFactoryContextPackAttestation,
  createFactoryHeldMountedAgentContextCapability,
  type FactoryMountedContextCapabilityInput,
  type MountedContextCapability
} from "./agent-runtime-context-packs.js";
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

export interface FactoryAttestedRuntimeCapabilitiesInput {
  readonly contextRegistry?: ReturnType<typeof createContextPackRegistry>;
}

export interface FactoryAttestedRuntimeCapabilities {
  readonly contextRegistry: ReturnType<typeof createContextPackRegistry>;
  createMountedContextCapability(input: FactoryMountedContextCapabilityInput): MountedContextCapability;
}

/**
 * R is the sole construction boundary for mounted context authority. It
 * captures package-private registrar facts from an actual registry and never
 * accepts a caller-supplied registrar tuple, callback, or fallback map.
 */
export function createFactoryAttestedRuntimeCapabilities(
  rawInput: FactoryAttestedRuntimeCapabilitiesInput = {}
): FactoryAttestedRuntimeCapabilities {
  const input = canonicalFactoryAttestedRuntimeCapabilitiesInput(rawInput);
  const contextRegistry = input.contextRegistry ?? createContextPackRegistry();
  const factoryContextAttestation = captureFactoryContextPackAttestation(contextRegistry);
  return Object.freeze({
    contextRegistry,
    createMountedContextCapability(input: FactoryMountedContextCapabilityInput): MountedContextCapability {
      return createFactoryHeldMountedAgentContextCapability({
        ...input,
        factoryContextAttestation
      });
    }
  });
}

export const defaultLocalAgentRuntimeFactory: LocalAgentRuntimeFactory = (input) => {
  const configuredProviders = createLocalAgentProviderConfiguration({
    cwd: input.handle.config.cwd,
    now: input.now
  });

  const factoryCapabilities = createFactoryAttestedRuntimeCapabilities();
  return createAgentRuntime({
    ledger: input.handle.ledger,
    actor: input.actor,
    now: input.now,
    identityLifecycle: () => input.handle.residentIdentity.lifecycle(),
    identityLifecycleReady: () => input.handle.residentIdentity.ready(),
    providers: configuredProviders.providers,
    approvedToolExecutors: input.approvedToolExecutors ?? [],
    taskOrchestratorCapabilities: createLocalTaskOrchestratorCapabilities(configuredProviders, factoryCapabilities.contextRegistry)
  });
};

function createLocalTaskOrchestratorCapabilities(
  configuredProviders: ReturnType<typeof createLocalAgentProviderConfiguration>,
  contextRegistry: ReturnType<typeof createContextPackRegistry>
): AgentTaskOrchestratorRuntimeCapabilities {
  return Object.freeze({
    schemaVersion: "agent-task-orchestrator-runtime-capabilities.v1",
    workflowRegistry: { require: specialistWorkflowDescriptorFor },
    contextRegistry,
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

function canonicalFactoryAttestedRuntimeCapabilitiesInput(
  value: FactoryAttestedRuntimeCapabilitiesInput
): FactoryAttestedRuntimeCapabilitiesInput {
  if (typeof value !== "object" || value === null || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error("blocked.factory-context-attestation-required");
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.getOwnPropertySymbols(value).length !== 0 || Object.keys(descriptors).some((key) => key !== "contextRegistry")) {
    throw new Error("blocked.factory-context-attestation-required");
  }
  const contextRegistry = descriptors.contextRegistry;
  if (contextRegistry !== undefined && (!Object.prototype.hasOwnProperty.call(contextRegistry, "value") ||
    contextRegistry.enumerable !== true || contextRegistry.configurable !== true || contextRegistry.writable !== true)) {
    throw new Error("blocked.factory-context-attestation-required");
  }
  if (contextRegistry === undefined) {
    return Object.freeze({});
  }
  return Object.freeze({
    contextRegistry: contextRegistry.value as ReturnType<typeof createContextPackRegistry>
  });
}
