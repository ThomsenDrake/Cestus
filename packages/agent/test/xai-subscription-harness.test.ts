import { describe, expect, it } from "vitest";
import {
  createXaiSubscriptionHarness,
  type XaiOfficialFlowUnavailableEvidence
} from "../src/xai-subscription-harness.js";

const capabilityHash = "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";
const approvalBindingHash = "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const documentationHash = "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

function mountedReadback(record: XaiOfficialFlowUnavailableEvidence) {
  return {
    record,
    feasibilityEventId: "evt_xai_feasibility_current",
    readbackEventId: "evt_xai_feasibility_readback"
  };
}

function currentPosture(overrides: Record<string, unknown> = {}) {
  return {
    residentAgentId: "agent_default" as const,
    workspaceId: "workspace_primary",
    mountInstanceId: "mount_primary",
    taskId: "task_primary",
    attemptId: "attempt_primary",
    runId: "run_primary",
    providerId: "provider_xai_grok",
    modelId: "grok-4",
    capabilityHash,
    credentialReference: {
      credentialRefId: "agent_credref_xai_primary",
      providerId: "provider_xai_grok",
      credentialKind: "subscription-oauth" as const,
      status: "healthy" as const,
      capabilityScopes: ["harness-execution"] as const
    },
    policy: {
      policyVersion: "policy_xai_harness_v1",
      providerId: "provider_xai_grok",
      modelId: "grok-4",
      capabilityHash,
      allowOfficialXaiHarness: true,
      officialFlowId: "xai-grok-named-integration.v1"
    },
    approval: {
      approvalClass: "provider-byte-transfer" as const,
      status: "approved" as const,
      bindingHash: approvalBindingHash
    },
    sourceEventIds: ["evt_xai_policy_current"] as const,
    ...overrides
  };
}

function createHarness(input: {
  readonly appended: XaiOfficialFlowUnavailableEvidence[];
  readonly append?: (evidence: XaiOfficialFlowUnavailableEvidence) => Promise<unknown>;
}): ReturnType<typeof createXaiSubscriptionHarness> {
  return createXaiSubscriptionHarness({
    currentPosture: currentPosture(),
    feasibilityAuthority: {
      appendOfficialFlowUnavailable: async (evidence) => {
        input.appended.push(evidence);
        return input.append?.(evidence) ?? mountedReadback(evidence);
      }
    }
  });
}

describe("official xAI subscription harness", () => {
  it("rejects each prohibited unofficial source without an append or unsafe result", async () => {
    const prohibitedSources = [
      "browser-cookie",
      "browser-session-storage",
      "browser-session-data",
      "token-cache",
      "cli-auth-store",
      "environment-token",
      "intercepted-header",
      "undocumented-endpoint",
      "reverse-engineered-grant",
      "subscription-to-api-key-conversion"
    ];

    for (const kind of prohibitedSources) {
      const appended: XaiOfficialFlowUnavailableEvidence[] = [];
      const sourceMaterial = `unsafe-${kind}-material`;
      const result = await createHarness({ appended }).assess({
        posture: currentPosture(),
        officialFlow: { kind, material: sourceMaterial }
      });

      expect(result).toMatchObject({
        kind: "blocked",
        category: "prohibited-credential-source",
        safeDiagnosticCodes: ["prohibited-credential-source"]
      });
      expect(appended).toEqual([]);
      expect(JSON.stringify(result)).not.toContain(sourceMaterial);
    }
  });

  it("classifies a prohibited source before inspecting its accessor-backed material", async () => {
    const appended: XaiOfficialFlowUnavailableEvidence[] = [];
    let materialDescriptorReads = 0;
    let materialValueReads = 0;
    const officialFlow = new Proxy(
      Object.defineProperty({ kind: "browser-cookie" }, "material", {
        enumerable: true,
        get() {
          materialValueReads += 1;
          throw new Error("prohibited material must not be read");
        }
      }),
      {
        getOwnPropertyDescriptor(target, property) {
          if (property === "material") {
            materialDescriptorReads += 1;
          }
          return Reflect.getOwnPropertyDescriptor(target, property);
        }
      }
    );

    const result = await createHarness({ appended }).assess({
      posture: currentPosture(),
      officialFlow
    });

    expect(materialDescriptorReads).toBe(0);
    expect(materialValueReads).toBe(0);
    expect(result).toMatchObject({
      kind: "blocked",
      category: "prohibited-credential-source"
    });
    expect(appended).toEqual([]);
  });

  it("records only mounted secret-safe unavailable evidence when official xAI support is absent", async () => {
    const appended: XaiOfficialFlowUnavailableEvidence[] = [];
    const result = await createHarness({ appended }).assess({
      posture: currentPosture(),
      officialFlow: undefined
    });

    expect(result).toEqual({
      kind: "unavailable",
      category: "official-flow-unavailable",
      providerId: "provider_xai_grok",
      modelId: "grok-4",
      capabilityHash,
      safeDiagnosticCodes: ["official-flow-unavailable"]
    });
    expect(appended).toEqual([
      {
        recordVersion: "agent-provider-feasibility.v1",
        providerId: "provider_xai_grok",
        modelId: "grok-4",
        capabilityHash,
        credentialRefId: "agent_credref_xai_primary",
        posture: "unavailable",
        category: "official-flow-unavailable",
        policyVersion: "policy_xai_harness_v1",
        workspaceId: "workspace_primary",
        mountInstanceId: "mount_primary",
        runId: "run_primary",
        approvalClass: "provider-byte-transfer",
        sourceEventIds: ["evt_xai_policy_current"],
        documentationHash: undefined,
        idempotencyKey: "provider_xai_grok|xai-grok-named-integration.v1|policy_xai_harness_v1|mount_primary"
      }
    ]);
    expect(JSON.stringify({ result, appended })).not.toMatch(/cookie|session|authorization|bearer|api[ _-]?key|token/i);
  });

  it("rejects unrecognized secret or alternate-provider ports instead of resolving, emulating, or substituting", async () => {
    const appended: XaiOfficialFlowUnavailableEvidence[] = [];
    let secretResolutions = 0;
    let alternateProviderCalls = 0;
    const harness = createXaiSubscriptionHarness({
      currentPosture: currentPosture(),
      feasibilityAuthority: {
        appendOfficialFlowUnavailable: async (evidence: XaiOfficialFlowUnavailableEvidence) => {
          appended.push(evidence);
        }
      },
      resolveSecret: () => { secretResolutions += 1; },
      useAlternateProvider: () => { alternateProviderCalls += 1; }
    });

    const result = await harness.assess({ posture: currentPosture(), officialFlow: undefined });

    expect(result).toMatchObject({ kind: "blocked", category: "unsafe-input" });
    expect(secretResolutions).toBe(0);
    expect(alternateProviderCalls).toBe(0);
    expect(appended).toEqual([]);
  });

  it.each([
    ["policy", currentPosture({ policy: { ...currentPosture().policy, policyVersion: "policy_xai_harness_v2" } })],
    ["capability", currentPosture({
      capabilityHash: approvalBindingHash,
      policy: { ...currentPosture().policy, capabilityHash: approvalBindingHash }
    })],
    ["credential reference", currentPosture({ credentialReference: { ...currentPosture().credentialReference, credentialRefId: "agent_credref_xai_other" } })],
    ["workspace", currentPosture({ workspaceId: "workspace_other" })],
    ["mount", currentPosture({ mountInstanceId: "mount_other" })],
    ["run", currentPosture({ runId: "run_other" })],
    ["approval", currentPosture({ approval: { ...currentPosture().approval, bindingHash: documentationHash } })]
  ])("fails closed for a swapped %s binding before appending evidence", async (_binding, posture) => {
    const appended: XaiOfficialFlowUnavailableEvidence[] = [];
    const result = await createHarness({ appended }).assess({ posture, officialFlow: undefined });

    expect(result).toMatchObject({
      kind: "blocked",
      category: "posture-mismatch",
      safeDiagnosticCodes: ["posture-mismatch"]
    });
    expect(appended).toEqual([]);
  });

  it("fails closed for unsafe posture data before an unavailable append", async () => {
    const appended: XaiOfficialFlowUnavailableEvidence[] = [];
    const scopes = Proxy.revocable(["harness-execution"], {});
    scopes.revoke();

    await expect(createHarness({ appended }).assess({
      posture: currentPosture({
        credentialReference: {
          ...currentPosture().credentialReference,
          capabilityScopes: scopes.proxy
        }
      }),
      officialFlow: undefined
    })).resolves.toMatchObject({ kind: "blocked", category: "unsafe-input" });
    expect(appended).toEqual([]);
  });

  it("rejects a self-consistent non-xAI provider posture before unavailable evidence can append", async () => {
    const appended: XaiOfficialFlowUnavailableEvidence[] = [];
    const result = await createHarness({ appended }).assess({
      posture: currentPosture({
        providerId: "provider_openai_codex",
        modelId: "codex-latest",
        credentialReference: {
          ...currentPosture().credentialReference,
          providerId: "provider_openai_codex"
        },
        policy: {
          ...currentPosture().policy,
          providerId: "provider_openai_codex",
          modelId: "codex-latest"
        }
      }),
      officialFlow: undefined
    });

    expect(result).toMatchObject({ kind: "blocked", category: "unsafe-input" });
    expect(appended).toEqual([]);
  });

  it("rejects a caller-supplied test route instead of exposing a non-production feasibility result", async () => {
    const appended: XaiOfficialFlowUnavailableEvidence[] = [];
    const result = await createHarness({ appended }).assess({
      posture: currentPosture(),
      officialFlow: {
        kind: "test-official-xai-route",
        officialFlowId: "xai-grok-named-integration.v1",
        documentationHash,
        interfaceOnly: true
      }
    });

    expect(result).toMatchObject({ kind: "blocked", category: "unsafe-input" });
    expect(appended).toEqual([]);
  });

  it("returns a bounded append failure when the mounted authority rejects unavailable evidence", async () => {
    const appended: XaiOfficialFlowUnavailableEvidence[] = [];
    const result = await createHarness({
      appended,
      append: async () => { throw new Error("mounted append rejected"); }
    }).assess({ posture: currentPosture(), officialFlow: undefined });

    expect(result).toMatchObject({
      kind: "blocked",
      category: "feasibility-append-unavailable",
      safeDiagnosticCodes: ["feasibility-append-unavailable"]
    });
  });

  it("rejects a resolving no-op append without a durable mounted readback", async () => {
    const appended: XaiOfficialFlowUnavailableEvidence[] = [];
    const result = await createHarness({
      appended,
      append: async () => undefined
    }).assess({ posture: currentPosture(), officialFlow: undefined });

    expect(result).toMatchObject({
      kind: "blocked",
      category: "feasibility-append-unavailable",
      safeDiagnosticCodes: ["feasibility-append-unavailable"]
    });
    expect(appended).toHaveLength(1);
  });

  it.each([
    ["workspace", (evidence: XaiOfficialFlowUnavailableEvidence) => ({ ...evidence, workspaceId: "workspace_other" })],
    ["mount", (evidence: XaiOfficialFlowUnavailableEvidence) => ({ ...evidence, mountInstanceId: "mount_other" })],
    ["run", (evidence: XaiOfficialFlowUnavailableEvidence) => ({ ...evidence, runId: "run_other" })],
    ["provider", (evidence: XaiOfficialFlowUnavailableEvidence) => ({ ...evidence, providerId: "provider_xai_other" })],
    ["model", (evidence: XaiOfficialFlowUnavailableEvidence) => ({ ...evidence, modelId: "grok-other" })],
    ["capability", (evidence: XaiOfficialFlowUnavailableEvidence) => ({ ...evidence, capabilityHash: approvalBindingHash })],
    ["policy", (evidence: XaiOfficialFlowUnavailableEvidence) => ({ ...evidence, policyVersion: "policy_xai_harness_v2" })]
  ])("rejects a %s-mismatched mounted append readback", async (_binding, mutate) => {
    const appended: XaiOfficialFlowUnavailableEvidence[] = [];
    const result = await createHarness({
      appended,
      append: async (evidence) => mountedReadback(mutate(evidence))
    }).assess({ posture: currentPosture(), officialFlow: undefined });

    expect(result).toMatchObject({
      kind: "blocked",
      category: "feasibility-append-unavailable",
      safeDiagnosticCodes: ["feasibility-append-unavailable"]
    });
    expect(appended).toHaveLength(1);
  });
});
