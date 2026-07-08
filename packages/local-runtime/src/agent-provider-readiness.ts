import {
  FakeModelProvider,
  SecretMaterial,
  StaticSecretStore,
  buildProviderReadiness,
  createCredentialReference,
  createNousPortalProvider,
  createProviderRegistry,
  providerDescriptorToCapabilityDescriptor,
  type AgentCredentialReference,
  type ModelProviderAdapter,
  type ProviderCapabilityRegistry,
  type ProviderReadinessDto,
  type SecretStore
} from "../../agent/src/index.js";
import { loadLocalAgentEnv } from "./agent-env.js";

const nousCredentialRefId = "agent_credref_nous_portal";

export interface LocalAgentProviderConfiguration {
  readonly providers: readonly ModelProviderAdapter[];
  readonly readinessRegistry: ProviderCapabilityRegistry;
  readonly credentialReferences: readonly AgentCredentialReference[];
  readonly secretStore: SecretStore;
}

export function createLocalAgentProviderConfiguration(input: {
  readonly cwd: string;
  readonly now: () => string;
  readonly env?: Record<string, string | undefined>;
}): LocalAgentProviderConfiguration {
  const localEnv = loadLocalAgentEnv({
    cwd: input.cwd,
    ...(input.env === undefined ? {} : { env: input.env })
  });
  const fakeLocalProvider = createFakeLocalProvider();
  const secretStore = createNousSecretStore(localEnv.nousApiKey, input.now);
  const nousProvider = createNousPortalProvider({
    secretStore,
    ...(localEnv.nousEndpoint === undefined ? {} : { endpointUrl: localEnv.nousEndpoint }),
    ...(localEnv.nousModel === undefined ? {} : { modelId: localEnv.nousModel })
  });

  const readinessRegistry = createProviderRegistry();
  readinessRegistry.register(providerDescriptorToCapabilityDescriptor(fakeLocalProvider.describe()));
  readinessRegistry.register(providerDescriptorToCapabilityDescriptor(nousProvider.describe()));

  const credentialReferences = [
    createNousCredentialReference(localEnv.nousApiKey === undefined ? "missing-binding" : "linked")
  ];

  const providers = localEnv.nousApiKey === undefined
    ? [fakeLocalProvider]
    : [fakeLocalProvider, nousProvider];

  return Object.freeze({
    providers: Object.freeze(providers),
    readinessRegistry,
    credentialReferences: Object.freeze(credentialReferences),
    secretStore
  });
}

export async function buildLocalAgentProviderReadiness(input: {
  readonly cwd: string;
  readonly now: () => string;
  readonly env?: Record<string, string | undefined>;
}): Promise<ProviderReadinessDto> {
  const configured = createLocalAgentProviderConfiguration({
    cwd: input.cwd,
    now: input.now,
    ...(input.env === undefined ? {} : { env: input.env })
  });

  return buildProviderReadiness({
    registry: configured.readinessRegistry,
    credentialReferences: configured.credentialReferences,
    secretStore: configured.secretStore,
    now: input.now
  });
}

function createFakeLocalProvider(): ModelProviderAdapter {
  return new FakeModelProvider({
    providerId: "provider_fake_local",
    modelFamilies: ["fake-local"],
    responseText: "Fake local provider ready."
  });
}

function createNousSecretStore(
  apiKey: string | undefined,
  now: () => string
): SecretStore {
  if (apiKey === undefined) {
    return new StaticSecretStore({}, { now });
  }
  return new StaticSecretStore({
    [nousCredentialRefId]: SecretMaterial.fromRuntimeValue(apiKey)
  }, { now });
}

function createNousCredentialReference(
  status: "linked" | "missing-binding"
): AgentCredentialReference {
  return createCredentialReference({
    credentialRefId: nousCredentialRefId,
    providerId: "provider_nous_portal",
    credentialKind: "api-key-bearer",
    scopeKind: "machine",
    capabilityScopes: ["model-inference", "provider-health"],
    safeLabel: "Nous Portal local binding",
    authorizedBy: "actor_local_operator",
    authorizedAt: "2026-07-08T00:00:00.000Z",
    policyVersion: "agent-provider-auth.v1",
    status
  });
}
