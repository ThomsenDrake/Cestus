import { describe, expect, it } from "vitest";
import {
  createAgentProviderConfiguration,
  type AgentProviderConfiguration,
  type ProviderConfigurationLane
} from "../src/agent-provider-configuration.js";
import type { CredentialKind } from "../../agent/src/credential-reference.js";
import type { ProviderCapabilityDescriptorInput } from "../../agent/src/provider-registry.js";

type Hash = `sha256:${string}`;
type EventId = `evt_${string}`;
type ConfigurationCapabilityScope = "model-inference" | "harness-execution";
type OfficialHarnessBackend = "openai-codex-harness" | "xai-harness";

interface RawCapability {
  capability: ProviderCapabilityDescriptorInput;
  capabilityHash: Hash;
  capabilitySourceEventId: EventId;
  capabilityRevision: string;
}

interface RawCredentialReference {
  credentialRefId: string;
  providerId: string;
  credentialKind: CredentialKind;
  scopeKind: "workspace";
  capabilityScopes: ConfigurationCapabilityScope[];
  safeLabel: string;
  authorizedBy: string;
  authorizedAt: string;
  expiresAt?: string;
  revokedAt?: string;
  status: "healthy";
  policyVersion: string;
  sourceEventIds: EventId[];
}

interface RawEndpointPolicy {
  endpointPolicyId: string;
  providerId: string;
  modelId: string;
  adapterVersion: string;
  policyVersion: string;
  scope: "exact-provider-model";
  status: "approved";
  sourceEventIds: EventId[];
}

interface RawOfficialEvidence {
  evidenceId: string;
  evidenceHash: Hash;
  officialFlow: "subscription-device-oauth";
  approvedScope: "model-inference";
  approvedCostPolicy: "subscription-entitlement";
  officialSourceEventIds: EventId[];
}

interface RawFeasibility {
  feasibilityId: string;
  state: "current";
  lane: ProviderConfigurationLane;
  providerId: string;
  modelId: string;
  capabilityHash: Hash;
  capabilitySourceEventId: EventId;
  capabilityRevision: string;
  credentialRefId: string;
  credentialKind: CredentialKind;
  endpointPolicyId: string;
  policyVersion: string;
  assessedAt: string;
  sourceEventIds: EventId[];
  officialEvidence?: RawOfficialEvidence;
}

interface RawConfiguration {
  capabilities: RawCapability[];
  credentialReferences: RawCredentialReference[];
  endpointPolicies: RawEndpointPolicy[];
  feasibility: RawFeasibility[];
}

interface OfficialHarnessFixtureOptions {
  readonly providerId?: string;
  readonly credentialKind?: "subscription-oauth" | "device-code-oauth";
  readonly capabilityScope?: ConfigurationCapabilityScope;
  readonly backendKind?: OfficialHarnessBackend;
}

interface TextMaterialMutation {
  readonly name: string;
  readonly create: () => RawConfiguration;
  readonly apply: (input: RawConfiguration) => void;
}

interface OfficialProviderFamilyBoundary {
  readonly providerId: string;
  readonly backendKind: OfficialHarnessBackend;
  readonly admitted: boolean;
}

const hash = (character: string): Hash => `sha256:${character.repeat(64)}`;
const officialProviderFamilyBoundaries: readonly OfficialProviderFamilyBoundary[] = [
  { providerId: "provider_openai_codex_primary", backendKind: "openai-codex-harness", admitted: true },
  { providerId: "provider_openai_codex_review_2", backendKind: "openai-codex-harness", admitted: true },
  { providerId: "provider_xai_grok", backendKind: "xai-harness", admitted: true },
  { providerId: "provider_xai_grokish", backendKind: "xai-harness", admitted: true },
  { providerId: "provider_openai_codex_", backendKind: "openai-codex-harness", admitted: false },
  { providerId: "provider_xai_", backendKind: "xai-harness", admitted: false },
  { providerId: "provider_openai_codexish_primary", backendKind: "openai-codex-harness", admitted: false },
  { providerId: "provider_openai_codex-primary", backendKind: "openai-codex-harness", admitted: false },
  { providerId: "provider_xaiish_grok", backendKind: "xai-harness", admitted: false },
  { providerId: "provider_xa1_grok", backendKind: "xai-harness", admitted: false }
];

describe("agent provider configuration", () => {
  it("normalizes exact capability, credential, policy, and current feasibility facts into immutable data", () => {
    const input = byokConfiguration();

    const configuration = createAgentProviderConfiguration(input);

    expect(configuration).toMatchObject({
      version: "agent-provider-configuration.v1",
      capabilities: [{
        capability: { providerId: "provider_openai_compatible", modelFamilies: ["model_text_1"] },
        capabilityHash: hash("a"),
        capabilitySourceEventId: "evt_capability_1",
        capabilityRevision: "capability_revision_1"
      }],
      credentialReferences: [{
        credentialRefId: "agent_credref_openai_compatible",
        providerId: "provider_openai_compatible"
      }],
      endpointPolicies: [{
        endpointPolicyId: "endpoint_policy_openai_compatible",
        scope: "exact-provider-model",
        status: "approved"
      }],
      feasibility: [{
        feasibilityId: "provider_feasibility_openai_compatible",
        state: "current",
        lane: "byok",
        providerId: "provider_openai_compatible",
        modelId: "model_text_1",
        sourceEventIds: ["evt_binding_1", "evt_capability_1", "evt_endpoint_policy_1"]
      }]
    });
    assertImmutable(configuration);
    expect(input.capabilities[0]?.capability.modelFamilies).toEqual(["model_text_1"]);
  });

  it("admits only the exact local-engine and official-harness exceptions; every API lane remains BYOK", () => {
    const configuration = byokConfiguration();
    appendLocalLane(configuration);
    appendOfficialHarnessLane(configuration);

    const normalized = createAgentProviderConfiguration(configuration);

    expect(normalized.feasibility.map((record) => [record.providerId, record.lane])).toEqual([
      ["provider_local_engine", "local-engine"],
      ["provider_openai_codex_primary", "official-harness"],
      ["provider_openai_compatible", "byok"]
    ]);

    const remoteAsLocal = byokConfiguration();
    only(remoteAsLocal.feasibility).lane = "local-engine";
    expect(() => createAgentProviderConfiguration(remoteAsLocal)).toThrow("invalid provider configuration");
  });

  it("rejects duplicate, stale, mismatched, unapproved, fallback, secret-or-host-bearing, and hostile configuration facts", () => {
    const duplicateCapability = copy(byokConfiguration());
    duplicateCapability.capabilities.push(copy(only(duplicateCapability.capabilities)));

    const staleFeasibility = copy(byokConfiguration());
    Object.defineProperty(only(staleFeasibility.feasibility), "state", { value: "superseded", enumerable: true });

    const modelMismatch = copy(byokConfiguration());
    only(modelMismatch.feasibility).modelId = "model_not_assessed";

    const referenceMismatch = copy(byokConfiguration());
    only(referenceMismatch.feasibility).credentialRefId = "agent_credref_different";

    const unapprovedPolicy = copy(byokConfiguration());
    Object.defineProperty(only(unapprovedPolicy.endpointPolicies), "status", { value: "unapproved", enumerable: true });

    const fallback = Object.assign(copy(byokConfiguration()), { fallbackProviderId: "provider_other" });

    const hostMaterial = copy(byokConfiguration());
    Object.defineProperty(only(hostMaterial.endpointPolicies), "policyLabel", {
      value: "https://api.example.invalid",
      enumerable: true
    });

    const secretMaterial = copy(byokConfiguration());
    only(secretMaterial.credentialReferences).safeLabel = "Bearer secret value";

    const withAccessor = copy(byokConfiguration());
    let accessorRead = false;
    Object.defineProperty(withAccessor, "alternateStorage", {
      enumerable: true,
      get() {
        accessorRead = true;
        return "unexpected";
      }
    });

    const withSymbol = copy(byokConfiguration());
    Object.defineProperty(only(withSymbol.capabilities), Symbol("unexpected"), {
      value: "unexpected",
      enumerable: true
    });

    const withPrototype = Object.setPrototypeOf(copy(byokConfiguration()), { inherited: true });

    const sparseCapabilities = copy(byokConfiguration());
    const sparse: RawCapability[] = [];
    sparse[1] = byokCapability();
    sparseCapabilities.capabilities = sparse;

    for (const input of [
      duplicateCapability,
      staleFeasibility,
      modelMismatch,
      referenceMismatch,
      unapprovedPolicy,
      fallback,
      hostMaterial,
      secretMaterial,
      withAccessor,
      withSymbol,
      withPrototype,
      sparseCapabilities
    ]) {
      expect(() => createAgentProviderConfiguration(input)).toThrow("invalid provider configuration");
    }
    expect(accessorRead).toBe(false);
  });

  it("rejects an advertised capability model that is not exactly assessed", () => {
    const input = byokConfiguration();
    only(input.capabilities).capability.modelFamilies.push("model_unassessed_2");

    expect(() => createAgentProviderConfiguration(input)).toThrow("invalid provider configuration");
  });

  it("rejects feasibility provenance unrelated to its capability, reference, and policy facts", () => {
    const input = byokConfiguration();
    only(input.feasibility).sourceEventIds = ["evt_unrelated_1"];

    expect(() => createAgentProviderConfiguration(input)).toThrow("invalid provider configuration");
  });

  it("rejects websocket IP material in data-handling text", () => {
    const input = byokConfiguration();
    only(input.capabilities).capability.dataHandlingNotes = "Use wss://10.0.0.1/socket for provider access.";

    expect(() => createAgentProviderConfiguration(input)).toThrow("invalid provider configuration");
  });

  it("rejects an OpenAI-compatible BYOK capability without the transfer-approval diagnostic", () => {
    const input = byokConfiguration();
    only(input.capabilities).capability.diagnosticContract = ["needs-api-key"];

    expect(() => createAgentProviderConfiguration(input)).toThrow("invalid provider configuration");
  });

  it("rejects a local-engine capability with an additional optional API-key requirement", () => {
    const input = byokConfiguration();
    appendLocalLane(input);
    only(input.capabilities).capability.credentialRequirements.push({ credentialKind: "api-key-bearer", required: false });

    expect(() => createAgentProviderConfiguration(input)).toThrow("invalid provider configuration");
  });

  it("rejects lax official Codex-harness tool, output, workspace, identity, and evidence classifications", () => {
    const corruptions: readonly ((input: RawConfiguration) => void)[] = [
      (input) => {
        only(input.capabilities).capability.toolSupport = "function-calling";
      },
      (input) => {
        only(input.capabilities).capability.structuredOutputSupport = "schema-strict";
      },
      (input) => {
        only(input.capabilities).capability.workspaceScopes = ["workspace"];
      },
      (input) => {
        replaceHarnessProviderIdentity(input, "provider_unofficial_harness");
      },
      (input) => {
        Object.defineProperty(only(input.feasibility).officialEvidence, "officialFlow", {
          value: "browser-cookie",
          enumerable: true
        });
      }
    ];

    for (const corrupt of corruptions) {
      const input = officialHarnessConfiguration();
      corrupt(input);
      expect(() => createAgentProviderConfiguration(input)).toThrow("invalid provider configuration");
    }
  });

  it("canonicalizes deterministic provenance source-event arrays", () => {
    const reversed = officialHarnessConfiguration();
    const canonical = officialHarnessConfiguration();
    const feasibilitySources: EventId[] = [
      "evt_binding_harness_1",
      "evt_binding_harness_2",
      "evt_capability_harness_1",
      "evt_endpoint_policy_harness_1",
      "evt_endpoint_policy_harness_2",
      "evt_official_harness_1",
      "evt_official_harness_2"
    ];

    only(reversed.credentialReferences).sourceEventIds = ["evt_binding_harness_2", "evt_binding_harness_1"];
    only(reversed.endpointPolicies).sourceEventIds = ["evt_endpoint_policy_harness_2", "evt_endpoint_policy_harness_1"];
    requireOfficialEvidence(only(reversed.feasibility)).officialSourceEventIds = ["evt_official_harness_2", "evt_official_harness_1"];
    only(reversed.feasibility).sourceEventIds = feasibilitySources;

    only(canonical.credentialReferences).sourceEventIds = ["evt_binding_harness_1", "evt_binding_harness_2"];
    only(canonical.endpointPolicies).sourceEventIds = ["evt_endpoint_policy_harness_1", "evt_endpoint_policy_harness_2"];
    requireOfficialEvidence(only(canonical.feasibility)).officialSourceEventIds = ["evt_official_harness_1", "evt_official_harness_2"];
    only(canonical.feasibility).sourceEventIds = feasibilitySources;

    const reversedSnapshot = createAgentProviderConfiguration(reversed);
    const canonicalSnapshot = createAgentProviderConfiguration(canonical);

    expect(reversedSnapshot).toEqual(canonicalSnapshot);
    expect(only(reversedSnapshot.credentialReferences).sourceEventIds).toEqual(["evt_binding_harness_1", "evt_binding_harness_2"]);
    expect(only(reversedSnapshot.endpointPolicies).sourceEventIds).toEqual(["evt_endpoint_policy_harness_1", "evt_endpoint_policy_harness_2"]);
    expect(only(reversedSnapshot.feasibility).officialEvidence?.officialSourceEventIds).toEqual([
      "evt_official_harness_1",
      "evt_official_harness_2"
    ]);
  });

  it("admits both released official provider families with either released OAuth credential kind", () => {
    const rejected: string[] = [];
    const credentialKinds = ["subscription-oauth", "device-code-oauth"] as const;

    for (const provider of officialProviderFamilyBoundaries) {
      if (!provider.admitted) continue;
      for (const credentialKind of credentialKinds) {
        const input = officialHarnessConfiguration({
          providerId: provider.providerId,
          backendKind: provider.backendKind,
          credentialKind
        });
        if (!accepts(input)) rejected.push(`${provider.providerId}:${credentialKind}`);
      }
    }

    expect(rejected).toEqual([]);
  });

  it("enforces the typed anchored official-provider family boundary", () => {
    const unexpectedAdmissions: string[] = [];

    for (const provider of officialProviderFamilyBoundaries) {
      const input = officialHarnessConfiguration({
        providerId: provider.providerId,
        backendKind: provider.backendKind
      });
      if (accepts(input) !== provider.admitted) unexpectedAdmissions.push(provider.providerId);
    }

    expect(unexpectedAdmissions).toEqual([]);
  });

  it("requires exact lane-specific credential scopes", () => {
    const missingPositiveAdmissions: string[] = [];
    const acceptedInvalidScopes: string[] = [];

    const byok = byokConfiguration();
    if (!accepts(byok)) missingPositiveAdmissions.push("BYOK model-inference");

    const local = byokConfiguration();
    appendLocalLane(local);
    if (!accepts(local)) missingPositiveAdmissions.push("local model-inference");

    const official = officialHarnessConfiguration({
      providerId: "provider_openai_codex_harness",
      capabilityScope: "harness-execution"
    });
    if (!accepts(official)) missingPositiveAdmissions.push("official harness-execution");

    const officialModelInference = officialHarnessConfiguration({
      providerId: "provider_openai_codex_harness",
      capabilityScope: "model-inference"
    });
    if (accepts(officialModelInference)) acceptedInvalidScopes.push("official model-inference");

    const byokHarnessExecution = byokConfiguration();
    only(byokHarnessExecution.credentialReferences).capabilityScopes = ["harness-execution"];
    if (accepts(byokHarnessExecution)) acceptedInvalidScopes.push("BYOK harness-execution");

    const localHarnessExecution = byokConfiguration();
    appendLocalLane(localHarnessExecution);
    only(localHarnessExecution.credentialReferences).capabilityScopes = ["harness-execution"];
    if (accepts(localHarnessExecution)) acceptedInvalidScopes.push("local harness-execution");

    expect({ missingPositiveAdmissions, acceptedInvalidScopes }).toEqual({
      missingPositiveAdmissions: [],
      acceptedInvalidScopes: []
    });
  });

  it("rejects URI, IP, localhost, and DNS-host material independently of a finite TLD list", () => {
    const materials = [
      "wss://10.0.0.1/socket",
      "https://api.example.xyz",
      "ftp://api.service.corp/archive",
      "10.0.0.1",
      "::1",
      "2001:db8::1",
      "fe80::1%lo0",
      "::ffff:192.0.2.128",
      "[2001:db8::1]",
      "localhost",
      "api.example.xyz",
      "api.service.corp"
    ];
    const accepted: string[] = [];

    for (const material of materials) {
      const input = byokConfiguration();
      only(input.capabilities).capability.dataHandlingNotes = material;
      if (accepts(input)) accepted.push(material);
    }

    const ordinary = byokConfiguration();
    only(ordinary.capabilities).capability.dataHandlingNotes = "ordinary policy.v1 prose";
    only(ordinary.capabilities).capability.adapterVersion = "adapter.v1";
    only(ordinary.endpointPolicies).adapterVersion = "adapter.v1";
    only(ordinary.credentialReferences).policyVersion = "policy.v1";
    only(ordinary.endpointPolicies).policyVersion = "policy.v1";
    only(ordinary.feasibility).policyVersion = "policy.v1";
    only(ordinary.feasibility).assessedAt = "2026-07-18T12:00:00.000Z";

    expect({ accepted, ordinaryAccepted: accepts(ordinary) }).toEqual({
      accepted: [],
      ordinaryAccepted: true
    });
  });

  it("rejects single-character terminal DNS labels across capability and credential text", () => {
    const hosts = ["api.x", "a.b"];
    const accepted: string[] = [];

    for (const host of hosts) {
      const capability = byokConfiguration();
      only(capability.capabilities).capability.dataHandlingNotes = host;
      if (accepts(capability)) accepted.push(`capability:${host}`);

      const credential = byokConfiguration();
      only(credential.credentialReferences).safeLabel = host;
      if (accepts(credential)) accepted.push(`credential:${host}`);
    }

    const controls = byokConfiguration();
    only(controls.capabilities).capability.adapterVersion = "adapter.v1";
    only(controls.endpointPolicies).adapterVersion = "adapter.v1";
    only(controls.credentialReferences).policyVersion = "policy.v1";
    only(controls.endpointPolicies).policyVersion = "policy.v1";
    only(controls.feasibility).policyVersion = "policy.v1";

    expect({ accepted, controlsAccepted: accepts(controls) }).toEqual({
      accepted: [],
      controlsAccepted: true
    });
  });

  it("rejects healthy-status credential references with prior revocation from current feasibility", () => {
    const revoked = byokConfiguration();
    only(revoked.credentialReferences).status = "healthy";
    only(revoked.credentialReferences).revokedAt = "2026-07-17T12:00:00.000Z";
    const healthy = byokConfiguration();

    expect(() => createAgentProviderConfiguration(revoked)).toThrow("invalid provider configuration");
    expect(createAgentProviderConfiguration(healthy).feasibility).toHaveLength(1);
  });

  it("rejects embedded canonical and noncanonical IPv4 material without delimiter escapes", () => {
    const materials = [
      "reference_127.1_suffix",
      "reference-0x7f000001",
      "127.1:8080",
      "reference_127.0.0.1_suffix",
      "reference-127.0.0.1",
      "127.0.0.1:8080",
      "1.2"
    ];
    const accepted: string[] = [];

    for (const material of materials) {
      const capability = byokConfiguration();
      only(capability.capabilities).capability.dataHandlingNotes = material;
      if (accepts(capability)) accepted.push(`capability:${material}`);

      const credential = byokConfiguration();
      only(credential.credentialReferences).safeLabel = material;
      if (accepts(credential)) accepted.push(`credential:${material}`);
    }

    const controls = byokConfiguration();
    only(controls.capabilities).capability.dataHandlingNotes = "ordinary policy.v1 prose";
    only(controls.capabilities).capability.adapterVersion = "adapter.v1";
    only(controls.endpointPolicies).adapterVersion = "adapter.v1";
    only(controls.credentialReferences).policyVersion = "policy.v1";
    only(controls.endpointPolicies).policyVersion = "policy.v1";
    only(controls.feasibility).policyVersion = "policy.v1";
    only(controls.feasibility).assessedAt = "2026-07-18T12:00:00.000Z";

    expect({ accepted, controlsAccepted: accepts(controls) }).toEqual({
      accepted: [],
      controlsAccepted: true
    });
  });

  it("requires credentials to be authorized at the current feasibility assessment", () => {
    const authorizedAfterAssessment = byokConfiguration();
    only(authorizedAfterAssessment.credentialReferences).authorizedAt = "2026-07-18T12:00:00.001Z";

    const authorizedAtAssessment = byokConfiguration();

    const authorizedBeforeAssessment = byokConfiguration();
    only(authorizedBeforeAssessment.credentialReferences).authorizedAt = "2026-07-18T11:59:59.999Z";

    const unexpired = byokConfiguration();
    only(unexpired.credentialReferences).expiresAt = "2026-07-18T12:00:00.001Z";

    const expiresAtAssessment = byokConfiguration();
    only(expiresAtAssessment.credentialReferences).expiresAt = "2026-07-18T12:00:00.000Z";

    const revoked = byokConfiguration();
    only(revoked.credentialReferences).revokedAt = "2026-07-17T12:00:00.000Z";

    const rejected: string[] = [];
    if (accepts(authorizedAfterAssessment)) rejected.push("authorized-after-assessment");
    if (accepts(expiresAtAssessment)) rejected.push("expires-at-assessment");
    if (accepts(revoked)) rejected.push("revoked");

    const admitted: string[] = [];
    if (!accepts(authorizedAtAssessment)) admitted.push("authorized-at-assessment");
    if (!accepts(authorizedBeforeAssessment)) admitted.push("authorized-before-assessment");
    if (!accepts(unexpired)) admitted.push("unexpired");

    expect({ rejected, admitted }).toEqual({ rejected: [], admitted: [] });
  });

  it("rejects Unicode DNS and whole short numeric host material while retaining released versions", () => {
    const materials = ["api.a1", "api.3com", "service.123", "x.y9", "api.例子", "0", "1", "01", "127", "1:80", "127:443"];
    const accepted: string[] = [];
    for (const material of materials) {
      const capability = byokConfiguration();
      only(capability.capabilities).capability.dataHandlingNotes = material;
      if (accepts(capability)) accepted.push(`capability:${material}`);
      const credential = byokConfiguration();
      only(credential.credentialReferences).safeLabel = material;
      if (accepts(credential)) accepted.push(`credential:${material}`);
    }
    const controls = byokConfiguration();
    only(controls.capabilities).capability.adapterVersion = "adapter.v1";
    only(controls.endpointPolicies).adapterVersion = "adapter.v1";
    only(controls.credentialReferences).policyVersion = "policy.v1";
    only(controls.endpointPolicies).policyVersion = "policy.v1";
    only(controls.feasibility).policyVersion = "policy.v1";
    expect({ accepted, controlsAccepted: accepts(controls) }).toEqual({ accepted: [], controlsAccepted: true });
  });

  it("rejects IDNA-equivalent DNS separators and normalized combining-mark labels", () => {
    const materials = ["api。例子", "api。example", "api．example", "api｡example", "á.b"];
    const accepted: string[] = [];

    for (const material of materials) {
      const capability = byokConfiguration();
      only(capability.capabilities).capability.dataHandlingNotes = material;
      if (accepts(capability)) accepted.push(`capability:${material}`);

      const credential = byokConfiguration();
      only(credential.credentialReferences).safeLabel = material;
      if (accepts(credential)) accepted.push(`credential:${material}`);
    }

    const agentProviderAuth = byokConfiguration();
    only(agentProviderAuth.capabilities).capability.adapterVersion = "agent-provider-auth.v1";
    only(agentProviderAuth.endpointPolicies).adapterVersion = "agent-provider-auth.v1";

    const adapter = byokConfiguration();
    only(adapter.capabilities).capability.adapterVersion = "adapter.v1";
    only(adapter.endpointPolicies).adapterVersion = "adapter.v1";

    const controls = byokConfiguration();
    only(controls.capabilities).capability.dataHandlingNotes = "ordinary policy.v1 prose";
    only(controls.credentialReferences).safeLabel = "résumé data handling";
    only(controls.credentialReferences).policyVersion = "policy.v1";
    only(controls.endpointPolicies).policyVersion = "policy.v1";
    only(controls.feasibility).policyVersion = "policy.v1";
    only(controls.feasibility).assessedAt = "2026-07-18T12:00:00.000Z";

    expect({
      accepted,
      controlsAccepted: [accepts(agentProviderAuth), accepts(adapter), accepts(controls)]
    }).toEqual({ accepted: [], controlsAccepted: [true, true, true] });
  });

  it("rejects IDNA lookalikes of exact released version tokens", () => {
    const versions = ["agent-provider-auth.v1", "policy.v1", "adapter.v1"];
    const separators = ["。", "．", "｡"];
    const accepted: string[] = [];

    for (const version of versions) {
      for (const separator of separators) {
        const lookalike = version.replace(".", separator);
        const capability = byokConfiguration();
        only(capability.capabilities).capability.dataHandlingNotes = lookalike;
        if (accepts(capability)) accepted.push(`capability:${lookalike}`);

        const credential = byokConfiguration();
        only(credential.credentialReferences).safeLabel = lookalike;
        if (accepts(credential)) accepted.push(`credential:${lookalike}`);
      }
    }

    const agentProviderAuth = byokConfiguration();
    only(agentProviderAuth.capabilities).capability.adapterVersion = "agent-provider-auth.v1";
    only(agentProviderAuth.endpointPolicies).adapterVersion = "agent-provider-auth.v1";

    const policy = byokConfiguration();
    only(policy.credentialReferences).policyVersion = "policy.v1";
    only(policy.endpointPolicies).policyVersion = "policy.v1";
    only(policy.feasibility).policyVersion = "policy.v1";

    const adapter = byokConfiguration();
    only(adapter.capabilities).capability.adapterVersion = "adapter.v1";
    only(adapter.endpointPolicies).adapterVersion = "adapter.v1";

    const prose = byokConfiguration();
    only(prose.capabilities).capability.dataHandlingNotes = "ordinary policy.v1 prose";
    only(prose.credentialReferences).safeLabel = "résumé data handling";
    only(prose.feasibility).assessedAt = "2026-07-18T12:00:00.000Z";

    expect({
      accepted,
      controlsAccepted: [accepts(agentProviderAuth), accepts(policy), accepts(adapter), accepts(prose)]
    }).toEqual({ accepted: [], controlsAccepted: [true, true, true, true] });
  });

  it("requires canonical ISO-millisecond-Z assessment timestamps", () => {
    const prose = byokConfiguration();
    only(prose.feasibility).assessedAt = "July 18, 2026 12:00:00 UTC";
    const canonical = byokConfiguration();
    expect(() => createAgentProviderConfiguration(prose)).toThrow("invalid provider configuration");
    expect(createAgentProviderConfiguration(canonical).feasibility).toHaveLength(1);
  });

  it("canonicalizes set-like capability arrays and rejects their duplicates", () => {
    const reversed = byokConfiguration();
    const canonical = byokConfiguration();
    only(reversed.capabilities).capability.modalities = ["text", "image"];
    only(reversed.capabilities).capability.diagnosticContract = ["requires-byte-transfer-approval", "needs-api-key"];
    only(canonical.capabilities).capability.modalities = ["image", "text"];
    only(canonical.capabilities).capability.diagnosticContract = ["needs-api-key", "requires-byte-transfer-approval"];
    const duplicateModalities = byokConfiguration();
    only(duplicateModalities.capabilities).capability.modalities = ["text", "text"];
    const duplicateDiagnostics = byokConfiguration();
    only(duplicateDiagnostics.capabilities).capability.diagnosticContract = ["needs-api-key", "needs-api-key"];
    expect(createAgentProviderConfiguration(reversed)).toEqual(createAgentProviderConfiguration(canonical));
    expect(() => createAgentProviderConfiguration(duplicateModalities)).toThrow("invalid provider configuration");
    expect(() => createAgentProviderConfiguration(duplicateDiagnostics)).toThrow("invalid provider configuration");
  });

  it("rejects standard-parser-recognized noncanonical IPv4 host spellings", () => {
    const materials = [
      "127.1",
      "2130706433",
      "0x7f000001",
      "127.0.1",
      "0177.0.0.1",
      "0x7f.1"
    ];
    const accepted: string[] = [];

    for (const material of materials) {
      const input = byokConfiguration();
      only(input.capabilities).capability.dataHandlingNotes = material;
      if (accepts(input)) accepted.push(material);
    }

    expect(accepted).toEqual([]);
  });

  it("rejects opaque URI material after non-scheme delimiters in credential labels", () => {
    const labels = [
      "reference_https:opaque",
      "reference-https:opaque",
      "reference.https:opaque",
      "reference/https:opaque"
    ];
    const accepted: string[] = [];

    for (const safeLabel of labels) {
      const input = byokConfiguration();
      only(input.credentialReferences).safeLabel = safeLabel;
      if (accepts(input)) accepted.push(safeLabel);
    }

    expect(accepted).toEqual([]);
  });

  it("rejects payload-empty bare URI schemes across capability and credential text", () => {
    const schemes = ["mailto:", "urn:", "data:", "file:", "http:", "https:"];
    const accepted: string[] = [];

    for (const scheme of schemes) {
      const capability = byokConfiguration();
      only(capability.capabilities).capability.dataHandlingNotes = scheme;
      if (accepts(capability)) accepted.push(`capability:${scheme}`);

      const credential = byokConfiguration();
      only(credential.credentialReferences).safeLabel = scheme;
      if (accepts(credential)) accepted.push(`credential:${scheme}`);
    }

    const controls = byokConfiguration();
    only(controls.capabilities).capability.dataHandlingNotes = "ordinary policy.v1 prose";
    only(controls.capabilities).capability.adapterVersion = "adapter.v1";
    only(controls.endpointPolicies).adapterVersion = "adapter.v1";
    only(controls.credentialReferences).policyVersion = "policy.v1";
    only(controls.endpointPolicies).policyVersion = "policy.v1";
    only(controls.feasibility).policyVersion = "policy.v1";
    only(controls.feasibility).assessedAt = "2026-07-18T12:00:00.000Z";

    expect({ accepted, controlsAccepted: accepts(controls) }).toEqual({
      accepted: [],
      controlsAccepted: true
    });
  });

  it("sorts case-distinct released provider IDs in bytewise canonical order", () => {
    const input = officialHarnessConfiguration({ providerId: "provider_openai_codex_a" });
    const upperCase = officialHarnessConfiguration({ providerId: "provider_openai_codex_A" });
    const upperCaseCapability = only(upperCase.capabilities);
    const upperCaseReference = only(upperCase.credentialReferences);
    const upperCasePolicy = only(upperCase.endpointPolicies);
    const upperCaseFeasibility = only(upperCase.feasibility);
    const upperCaseEvidence = requireOfficialEvidence(upperCaseFeasibility);

    upperCaseCapability.capabilityHash = hash("e");
    upperCaseCapability.capabilitySourceEventId = "evt_capability_harness_upper_1";
    upperCaseCapability.capabilityRevision = "capability_revision_harness_upper_1";
    upperCaseReference.credentialRefId = "agent_credref_openai_codex_upper";
    upperCaseReference.sourceEventIds = ["evt_binding_harness_upper_1"];
    upperCasePolicy.endpointPolicyId = "endpoint_policy_openai_codex_upper";
    upperCasePolicy.sourceEventIds = ["evt_endpoint_policy_harness_upper_1"];
    upperCaseFeasibility.feasibilityId = "provider_feasibility_openai_codex_upper";
    upperCaseFeasibility.capabilityHash = hash("e");
    upperCaseFeasibility.capabilitySourceEventId = "evt_capability_harness_upper_1";
    upperCaseFeasibility.capabilityRevision = "capability_revision_harness_upper_1";
    upperCaseFeasibility.credentialRefId = "agent_credref_openai_codex_upper";
    upperCaseFeasibility.endpointPolicyId = "endpoint_policy_openai_codex_upper";
    upperCaseFeasibility.sourceEventIds = [
      "evt_binding_harness_upper_1",
      "evt_capability_harness_upper_1",
      "evt_endpoint_policy_harness_upper_1",
      "evt_official_harness_upper_1"
    ];
    upperCaseEvidence.officialSourceEventIds = ["evt_official_harness_upper_1"];

    input.capabilities.push(upperCaseCapability);
    input.credentialReferences.push(upperCaseReference);
    input.endpointPolicies.push(upperCasePolicy);
    input.feasibility.push(upperCaseFeasibility);

    const configuration = createAgentProviderConfiguration(input);

    expect(configuration.capabilities.map((entry) => entry.capability.providerId)).toEqual([
      "provider_openai_codex_A",
      "provider_openai_codex_a"
    ]);
  });

  it("applies the text-material boundary across configuration facts", () => {
    const mutations: readonly TextMaterialMutation[] = [
      {
        name: "capability free text",
        create: byokConfiguration,
        apply: (input) => {
          only(input.capabilities).capability.label = "api.example.xyz";
        }
      },
      {
        name: "capability version",
        create: byokConfiguration,
        apply: (input) => {
          only(input.capabilities).capability.adapterVersion = "adapter.api.example.xyz";
          only(input.endpointPolicies).adapterVersion = "adapter.api.example.xyz";
        }
      },
      {
        name: "credential reference free text",
        create: byokConfiguration,
        apply: (input) => {
          only(input.credentialReferences).safeLabel = "https://api.example.invalid";
        }
      },
      {
        name: "credential reference version",
        create: byokConfiguration,
        apply: (input) => {
          only(input.credentialReferences).policyVersion = "policy.api.example.xyz";
          only(input.endpointPolicies).policyVersion = "policy.api.example.xyz";
          only(input.feasibility).policyVersion = "policy.api.example.xyz";
        }
      },
      {
        name: "endpoint policy version",
        create: byokConfiguration,
        apply: (input) => {
          only(input.endpointPolicies).policyVersion = "policy.api.service.corp";
          only(input.credentialReferences).policyVersion = "policy.api.service.corp";
          only(input.feasibility).policyVersion = "policy.api.service.corp";
        }
      },
      {
        name: "feasibility version",
        create: byokConfiguration,
        apply: (input) => {
          only(input.feasibility).capabilityRevision = "revision.api.example.xyz";
          only(input.capabilities).capabilityRevision = "revision.api.example.xyz";
        }
      },
      {
        name: "official evidence ID",
        create: () => officialHarnessConfiguration({
          providerId: "provider_openai_codex_harness",
          capabilityScope: "model-inference"
        }),
        apply: (input) => {
          requireOfficialEvidence(only(input.feasibility)).evidenceId = "https://api.example.xyz";
        }
      }
    ];
    const accepted: string[] = [];

    for (const mutation of mutations) {
      const input = mutation.create();
      mutation.apply(input);
      if (accepts(input)) accepted.push(mutation.name);
    }

    expect(accepted).toEqual([]);
  });
});

function byokConfiguration(): RawConfiguration {
  return {
    capabilities: [byokCapability()],
    credentialReferences: [byokCredentialReference()],
    endpointPolicies: [byokEndpointPolicy()],
    feasibility: [byokFeasibility()]
  };
}

function officialHarnessConfiguration(options: OfficialHarnessFixtureOptions = {}): RawConfiguration {
  const providerId = options.providerId ?? "provider_openai_codex_primary";
  const credentialKind = options.credentialKind ?? "subscription-oauth";
  const capabilityScope = options.capabilityScope ?? "harness-execution";
  const backendKind = options.backendKind ?? (
    providerId.startsWith("provider_xai_") ? "xai-harness" : "openai-codex-harness"
  );
  const configuration = byokConfiguration();
  configuration.capabilities = [officialHarnessCapability(providerId, credentialKind, backendKind)];
  configuration.credentialReferences = [officialHarnessCredentialReference(providerId, credentialKind, capabilityScope)];
  configuration.endpointPolicies = [officialHarnessEndpointPolicy(providerId)];
  configuration.feasibility = [officialHarnessFeasibility(providerId, credentialKind)];
  return configuration;
}

function byokCapability(): RawCapability {
  return {
    capability: {
      providerId: "provider_openai_compatible",
      label: "OpenAI compatible provider",
      adapterVersion: "adapter_provider_v1",
      backendKind: "openai-compatible-api",
      modelFamilies: ["model_text_1"],
      modalities: ["text"],
      toolSupport: "function-calling",
      structuredOutputSupport: "schema-strict",
      contextLimits: { maxInputTokens: 8192, maxOutputTokens: 2048 },
      credentialRequirements: [{ credentialKind: "api-key-bearer", required: true }],
      dataHandlingNotes: "Remote provider requires approved byte transfer.",
      costPolicy: "metered-api",
      workspaceScopes: ["workspace"],
      approvalProfile: "remote-byte-transfer-gated",
      diagnosticContract: ["needs-api-key", "requires-byte-transfer-approval"],
      fakeSupport: false
    },
    capabilityHash: hash("a"),
    capabilitySourceEventId: "evt_capability_1",
    capabilityRevision: "capability_revision_1"
  };
}

function byokCredentialReference(): RawCredentialReference {
  return {
    credentialRefId: "agent_credref_openai_compatible",
    providerId: "provider_openai_compatible",
    credentialKind: "api-key-bearer",
    scopeKind: "workspace",
    capabilityScopes: ["model-inference"],
    safeLabel: "OpenAI compatible account reference",
    authorizedBy: "human_operator",
    authorizedAt: "2026-07-18T12:00:00.000Z",
    status: "healthy",
    policyVersion: "policy_provider_v1",
    sourceEventIds: ["evt_binding_1"]
  };
}

function byokEndpointPolicy(): RawEndpointPolicy {
  return {
    endpointPolicyId: "endpoint_policy_openai_compatible",
    providerId: "provider_openai_compatible",
    modelId: "model_text_1",
    adapterVersion: "adapter_provider_v1",
    policyVersion: "policy_provider_v1",
    scope: "exact-provider-model",
    status: "approved",
    sourceEventIds: ["evt_endpoint_policy_1"]
  };
}

function byokFeasibility(): RawFeasibility {
  return {
    feasibilityId: "provider_feasibility_openai_compatible",
    state: "current",
    lane: "byok",
    providerId: "provider_openai_compatible",
    modelId: "model_text_1",
    capabilityHash: hash("a"),
    capabilitySourceEventId: "evt_capability_1",
    capabilityRevision: "capability_revision_1",
    credentialRefId: "agent_credref_openai_compatible",
    credentialKind: "api-key-bearer",
    endpointPolicyId: "endpoint_policy_openai_compatible",
    policyVersion: "policy_provider_v1",
    assessedAt: "2026-07-18T12:00:00.000Z",
    sourceEventIds: ["evt_binding_1", "evt_capability_1", "evt_endpoint_policy_1"]
  };
}

function appendLocalLane(configuration: RawConfiguration): void {
  configuration.capabilities.push({
    capability: {
      ...byokCapability().capability,
      providerId: "provider_local_engine",
      label: "Local engine",
      backendKind: "local-engine",
      modelFamilies: ["model_local_1"],
      toolSupport: "none",
      credentialRequirements: [{ credentialKind: "local-no-secret", required: true }],
      dataHandlingNotes: "Local engine runs without credentials.",
      costPolicy: "local-compute",
      approvalProfile: "local-only",
      diagnosticContract: ["provider-ready"]
    },
    capabilityHash: hash("b"),
    capabilitySourceEventId: "evt_capability_local_1",
    capabilityRevision: "capability_revision_local_1"
  });
  configuration.credentialReferences.push({
    ...byokCredentialReference(),
    credentialRefId: "agent_credref_local_engine",
    providerId: "provider_local_engine",
    credentialKind: "local-no-secret",
    safeLabel: "Local engine account reference",
    sourceEventIds: ["evt_binding_local_1"]
  });
  configuration.endpointPolicies.push({
    ...byokEndpointPolicy(),
    endpointPolicyId: "endpoint_policy_local_engine",
    providerId: "provider_local_engine",
    modelId: "model_local_1",
    sourceEventIds: ["evt_endpoint_policy_local_1"]
  });
  configuration.feasibility.push({
    ...byokFeasibility(),
    feasibilityId: "provider_feasibility_local_engine",
    lane: "local-engine",
    providerId: "provider_local_engine",
    modelId: "model_local_1",
    capabilityHash: hash("b"),
    capabilitySourceEventId: "evt_capability_local_1",
    capabilityRevision: "capability_revision_local_1",
    credentialRefId: "agent_credref_local_engine",
    credentialKind: "local-no-secret",
    endpointPolicyId: "endpoint_policy_local_engine",
    sourceEventIds: ["evt_binding_local_1", "evt_capability_local_1", "evt_endpoint_policy_local_1"]
  });
}

function appendOfficialHarnessLane(configuration: RawConfiguration): void {
  const providerId = "provider_openai_codex_primary";
  const credentialKind = "subscription-oauth";
  const backendKind = "openai-codex-harness";
  configuration.capabilities.push(officialHarnessCapability(providerId, credentialKind, backendKind));
  configuration.credentialReferences.push(officialHarnessCredentialReference(providerId, credentialKind, "harness-execution"));
  configuration.endpointPolicies.push(officialHarnessEndpointPolicy(providerId));
  configuration.feasibility.push(officialHarnessFeasibility(providerId, credentialKind));
}

function officialHarnessCapability(
  providerId: string,
  credentialKind: "subscription-oauth" | "device-code-oauth",
  backendKind: OfficialHarnessBackend
): RawCapability {
  return {
    capability: {
      ...byokCapability().capability,
      providerId,
      label: "OpenAI Codex subscription harness",
      backendKind,
      modelFamilies: ["model_codex_harness_1"],
      toolSupport: "harness-tools",
      structuredOutputSupport: "harness-mediated",
      credentialRequirements: [{ credentialKind, required: true }],
      dataHandlingNotes: "Official Codex harness requires device sign in.",
      costPolicy: "subscription-entitlement",
      workspaceScopes: ["workspace", "user"],
      approvalProfile: "harness-workspace-gated",
      diagnosticContract: ["needs-device-sign-in"]
    },
    capabilityHash: hash("c"),
    capabilitySourceEventId: "evt_capability_harness_1",
    capabilityRevision: "capability_revision_harness_1"
  };
}

function officialHarnessCredentialReference(
  providerId: string,
  credentialKind: "subscription-oauth" | "device-code-oauth",
  capabilityScope: ConfigurationCapabilityScope
): RawCredentialReference {
  return {
    ...byokCredentialReference(),
    credentialRefId: "agent_credref_openai_codex_harness",
    providerId,
    credentialKind,
    capabilityScopes: [capabilityScope],
    safeLabel: "Official Codex account reference",
    sourceEventIds: ["evt_binding_harness_1"]
  };
}

function officialHarnessEndpointPolicy(providerId: string): RawEndpointPolicy {
  return {
    ...byokEndpointPolicy(),
    endpointPolicyId: "endpoint_policy_openai_codex_harness",
    providerId,
    modelId: "model_codex_harness_1",
    sourceEventIds: ["evt_endpoint_policy_harness_1"]
  };
}

function officialHarnessFeasibility(
  providerId: string,
  credentialKind: "subscription-oauth" | "device-code-oauth"
): RawFeasibility {
  return {
    ...byokFeasibility(),
    feasibilityId: "provider_feasibility_openai_codex_harness",
    lane: "official-harness",
    providerId,
    modelId: "model_codex_harness_1",
    capabilityHash: hash("c"),
    capabilitySourceEventId: "evt_capability_harness_1",
    capabilityRevision: "capability_revision_harness_1",
    credentialRefId: "agent_credref_openai_codex_harness",
    credentialKind,
    endpointPolicyId: "endpoint_policy_openai_codex_harness",
    sourceEventIds: [
      "evt_binding_harness_1",
      "evt_capability_harness_1",
      "evt_endpoint_policy_harness_1",
      "evt_official_harness_1"
    ],
    officialEvidence: {
      evidenceId: "evidence_official_harness_1",
      evidenceHash: hash("d"),
      officialFlow: "subscription-device-oauth",
      approvedScope: "model-inference",
      approvedCostPolicy: "subscription-entitlement",
      officialSourceEventIds: ["evt_official_harness_1"]
    }
  };
}

function replaceHarnessProviderIdentity(configuration: RawConfiguration, providerId: string): void {
  only(configuration.capabilities).capability.providerId = providerId;
  only(configuration.credentialReferences).providerId = providerId;
  only(configuration.endpointPolicies).providerId = providerId;
  only(configuration.feasibility).providerId = providerId;
}

function requireOfficialEvidence(feasibility: RawFeasibility): RawOfficialEvidence {
  const evidence = feasibility.officialEvidence;
  if (evidence === undefined) throw new Error("expected official evidence");
  return evidence;
}

function accepts(input: RawConfiguration): boolean {
  try {
    createAgentProviderConfiguration(input);
    return true;
  } catch {
    return false;
  }
}

function assertImmutable(configuration: AgentProviderConfiguration): void {
  expect(Object.isFrozen(configuration)).toBe(true);
  expect(Object.isFrozen(configuration.capabilities)).toBe(true);
  expect(Object.isFrozen(only(configuration.capabilities))).toBe(true);
  expect(Object.isFrozen(only(configuration.capabilities).capability)).toBe(true);
  expect(Object.isFrozen(only(configuration.credentialReferences))).toBe(true);
  expect(Object.isFrozen(only(configuration.feasibility).sourceEventIds)).toBe(true);
}

function copy<T>(value: T): T {
  return structuredClone(value);
}

function only<T>(values: readonly T[]): T {
  const value = values[0];
  if (value === undefined) throw new Error("expected one fixture value");
  return value;
}
