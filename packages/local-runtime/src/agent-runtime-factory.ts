import {
  FakeModelProvider,
  SecretMaterial,
  StaticSecretStore,
  createAgentRuntime,
  createNousPortalProvider,
  type ModelProviderAdapter
} from "../../agent/src/index.js";
import type { ActorRef } from "../../ontology/src/contracts.js";
import { loadLocalAgentEnv } from "./agent-env.js";
import type { LocalRuntimeHandle } from "./runtime-factory.js";

export interface LocalAgentRuntimeFactoryInput {
  readonly handle: LocalRuntimeHandle;
  readonly actor: ActorRef;
  readonly now: () => string;
}

export type LocalAgentRuntimeFactory = (
  input: LocalAgentRuntimeFactoryInput
) => ReturnType<typeof createAgentRuntime>;

export const defaultLocalAgentRuntimeFactory: LocalAgentRuntimeFactory = (input) => {
  const providers: ModelProviderAdapter[] = [
    new FakeModelProvider({
      providerId: "provider_fake_local",
      modelFamilies: ["fake-local"],
      responseText: "Fake local provider ready."
    })
  ];
  const localEnv = loadLocalAgentEnv({ cwd: input.handle.config.cwd });

  if (localEnv.nousApiKey !== undefined) {
    const secretStore = new StaticSecretStore({
      agent_credref_nous_portal: SecretMaterial.fromRuntimeValue(localEnv.nousApiKey)
    }, { now: input.now });
    providers.push(createNousPortalProvider({
      secretStore,
      resolveInputText: resolveInputTextForLocalRuntime,
      ...(localEnv.nousEndpoint === undefined ? {} : { endpointUrl: localEnv.nousEndpoint }),
      ...(localEnv.nousModel === undefined ? {} : { modelId: localEnv.nousModel })
    }));
  }

  return createAgentRuntime({
    ledger: input.handle.ledger,
    actor: input.actor,
    now: input.now,
    providers
  });
};

function resolveInputTextForLocalRuntime(inputArtifactHash: string): string {
  return `Cestus local runtime prompt artifact ${inputArtifactHash}.`;
}
