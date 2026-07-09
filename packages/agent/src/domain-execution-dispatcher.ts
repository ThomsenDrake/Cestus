import type { ActorRef } from "../../ontology/src/contracts.js";
import type { EventLedger } from "../../ontology/src/event-ledger.js";
import {
  createAgentDomainToolRegistry,
  type AgentDomainExecutionFailure,
  type AgentDomainExecutionResult,
  type AgentDomainToolDescriptor
} from "./domain-execution-descriptors.js";
import { createAgentScheduler } from "./scheduler.js";
import {
  agentApprovedToolExecutionFailure,
  type AgentApprovedToolExecutionFailure,
  type AgentApprovedToolExecutionInput,
  type AgentApprovedToolExecutorDescriptor,
  type AgentApprovedToolPreviewInput,
  type AgentApprovedToolPreviewResult,
  type AgentSchedulerWakeResultDto
} from "./scheduler-types.js";

export interface AgentDomainExecutionAdapter {
  readonly descriptor: AgentDomainToolDescriptor;
  buildCurrentPreview(
    input: AgentApprovedToolPreviewInput
  ): AgentApprovedToolPreviewResult | Promise<AgentApprovedToolPreviewResult>;
  executeApproved(
    input: AgentApprovedToolExecutionInput
  ): AgentDomainExecutionResult | Promise<AgentDomainExecutionResult>;
}

export interface CreateAgentDomainExecutionDispatcherInput {
  readonly ledger: EventLedger;
  readonly actor: ActorRef;
  readonly now: () => string;
  readonly adapters: readonly AgentDomainExecutionAdapter[];
}

export interface AgentDomainExecutionDispatcher {
  wake(): Promise<AgentSchedulerWakeResultDto>;
  resumeApprovedDomainTools(): Promise<AgentSchedulerWakeResultDto>;
}

export function toAgentApprovedToolExecutorDescriptor(
  adapter: AgentDomainExecutionAdapter
): AgentApprovedToolExecutorDescriptor {
  const descriptor = validatedDomainDescriptor(adapter.descriptor);
  return Object.freeze({
    toolId: descriptor.toolId,
    toolVersion: descriptor.toolVersion,
    sideEffectClass: descriptor.sideEffectClass,
    approvalClass: descriptor.requiredApprovalClass,
    buildCurrentPreview(input: AgentApprovedToolPreviewInput) {
      return adapter.buildCurrentPreview(input);
    },
    executeApproved(input: AgentApprovedToolExecutionInput) {
      return adapter.executeApproved(input);
    }
  });
}

export function createAgentDomainExecutionDispatcher(
  input: CreateAgentDomainExecutionDispatcherInput
): AgentDomainExecutionDispatcher {
  createAgentDomainToolRegistry(input.adapters.map((adapter) => adapter.descriptor));
  const scheduler = createAgentScheduler({
    ledger: input.ledger,
    actor: input.actor,
    now: input.now,
    descriptors: input.adapters.map(toAgentApprovedToolExecutorDescriptor)
  });

  return Object.freeze({
    wake() {
      return scheduler.wake();
    },
    resumeApprovedDomainTools() {
      return scheduler.wake();
    }
  });
}

export function agentDomainExecutionFailure(
  input: AgentDomainExecutionFailure
): AgentApprovedToolExecutionFailure {
  return agentApprovedToolExecutionFailure(input);
}

function validatedDomainDescriptor(descriptor: AgentDomainToolDescriptor): AgentDomainToolDescriptor {
  const registry = createAgentDomainToolRegistry([descriptor]);
  return registry.require(descriptor.toolId, descriptor.toolVersion);
}
