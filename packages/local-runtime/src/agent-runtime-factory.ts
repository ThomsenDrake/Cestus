import {
  createAgentRuntime,
  type AgentApprovedToolExecutorDescriptor
} from "../../agent/src/index.js";
import type { ActorRef } from "../../ontology/src/contracts.js";
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
    providers: configuredProviders.providers,
    approvedToolExecutors: input.approvedToolExecutors ?? []
  });
};
