import { FakeModelProvider, createAgentRuntime } from "../../agent/src/index.js";
import type { ActorRef } from "../../ontology/src/contracts.js";
import type { LocalRuntimeHandle } from "./runtime-factory.js";

export interface LocalAgentRuntimeFactoryInput {
  readonly handle: LocalRuntimeHandle;
  readonly actor: ActorRef;
  readonly now: () => string;
}

export type LocalAgentRuntimeFactory = (
  input: LocalAgentRuntimeFactoryInput
) => ReturnType<typeof createAgentRuntime>;

export const defaultLocalAgentRuntimeFactory: LocalAgentRuntimeFactory = (input) =>
  createAgentRuntime({
    ledger: input.handle.ledger,
    actor: input.actor,
    now: input.now,
    providers: [
      new FakeModelProvider({
        providerId: "provider_fake_local",
        modelFamilies: ["fake-local"],
        responseText: "Fake local provider ready."
      })
    ]
  });
