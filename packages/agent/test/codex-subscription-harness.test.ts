import { describe, expect, it } from "vitest";
import {
  inspectOfficialFlowAbsenceWitness
} from "../src/official-flow-feasibility.js";
import {
  createCodexSubscriptionHarness,
  type CodexSubscriptionHarnessResult
} from "../src/codex-subscription-harness.js";

const capabilityHash = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const approvalBindingHash = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const documentationHash = "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";

function assertBlockedResultType(_result: CodexSubscriptionHarnessResult): void {}

assertBlockedResultType({
  kind: "blocked",
  category: "unsafe-input",
  providerId: "provider_openai_codex_primary",
  modelId: "codex-latest",
  capabilityHash,
  // @ts-expect-error blocked diagnostics must use the matching category.
  safeDiagnosticCodes: ["posture-mismatch"]
});

function currentPosture(overrides: Record<string, unknown> = {}) {
  return {
    residentAgentId: "agent_default" as const,
    workspaceId: "ws_primary",
    mountInstanceId: "mount_primary",
    taskId: "task_primary",
    attemptId: "attempt_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    runId: "run_primary",
    providerId: "provider_openai_codex_primary",
    modelId: "codex-latest",
    capabilityHash,
    credentialReference: {
      credentialRefId: "agent_credref_codex_primary",
      providerId: "provider_openai_codex_primary",
      credentialKind: "subscription-oauth" as const,
      status: "healthy" as const,
      capabilityScopes: ["harness-execution"] as const
    },
    policy: {
      policyVersion: "policy_codex_harness_v1",
      providerId: "provider_openai_codex_primary",
      modelId: "codex-latest",
      capabilityHash,
      allowOfficialCodexHarness: true,
      officialFlowId: "codex-official-local-workflow.v1"
    },
    approval: {
      approvalClass: "provider-byte-transfer" as const,
      status: "approved" as const,
      bindingHash: approvalBindingHash
    },
    sourceEventIds: ["evt_approval_primary", "evt_codex_policy_current"] as const,
    causationEventId: "evt_codex_policy_current",
    ...overrides
  };
}

function createHarness(input: unknown = { currentPosture: currentPosture() }): ReturnType<typeof createCodexSubscriptionHarness> {
  return createCodexSubscriptionHarness(input);
}

function absentAssessment(posture: unknown = currentPosture()) {
  return { posture, officialFlow: undefined };
}

describe("official Codex subscription harness", () => {
  it("rejects a cookie credential source without secret resolution, request, or provider substitution", async () => {
    const harness = createHarness();
    const rawCookieMaterial = "session=codex_cookie_material";

    const result = await harness.assess({
      posture: currentPosture(),
      officialFlow: {
        kind: "browser-cookie",
        material: rawCookieMaterial
      }
    });

    expect(result).toEqual({
      kind: "blocked",
      category: "prohibited-credential-source",
      providerId: "provider_openai_codex_primary",
      modelId: "codex-latest",
      capabilityHash,
      safeDiagnosticCodes: ["prohibited-credential-source"]
    });
    expect(JSON.stringify(result)).not.toContain(rawCookieMaterial);
  });

  it("classifies a prohibited browser-cookie kind before inspecting accessor-backed material", async () => {
    const harness = createHarness();
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

    const result = await harness.assess({
      posture: currentPosture(),
      officialFlow
    });

    expect(materialDescriptorReads).toBe(0);
    expect(materialValueReads).toBe(0);
    expect(result).toMatchObject({
      kind: "blocked",
      category: "prohibited-credential-source",
      safeDiagnosticCodes: ["prohibited-credential-source"]
    });
  });

  it("returns the exact shared Codex absence witness for a canonical current posture", async () => {
    const harness = createHarness();

    const result = await harness.assess(absentAssessment());

    expect(result).toEqual({
      kind: "official-flow-absence-classified",
      category: "official-flow-absent",
      witness: {
        schemaVersion: "agent-official-flow-absence-witness.v1",
        providerFamily: "codex"
      }
    });
    if (result.kind !== "official-flow-absence-classified") {
      throw new Error("expected absence classification");
    }
    expect(inspectOfficialFlowAbsenceWitness(result.witness)).toEqual({
      schemaVersion: "agent-official-flow-absence.v1",
      residentAgentId: "agent_default",
      workspaceId: "ws_primary",
      mountInstanceId: "mount_primary",
      taskId: "task_primary",
      attemptId: "attempt_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      runId: "run_primary",
      providerFamily: "codex",
      providerId: "provider_openai_codex_primary",
      modelId: "codex-latest",
      capabilityHash,
      credentialRefId: "agent_credref_codex_primary",
      credentialKind: "subscription-oauth",
      capabilityScopes: ["harness-execution"],
      policyVersion: "policy_codex_harness_v1",
      officialFlowId: "codex-official-local-workflow.v1",
      approvalClass: "provider-byte-transfer",
      approvalBindingHash,
      sourceEventIds: ["evt_approval_primary", "evt_codex_policy_current"],
      causationEventId: "evt_codex_policy_current",
      classification: "official-flow-absent",
      classificationHash: "sha256:be788de650bb1c6d903cef18214929d6eb232c816c3097618d662fa0c6f54cae"
    });
  });

  it.each([
    "browser-session-storage",
    "token-cache",
    "cli-auth-store",
    "environment-token",
    "intercepted-header",
    "undocumented-api",
    "reverse-engineered-device-grant",
    "subscription-token-as-api-key"
  ])("rejects prohibited unofficial source %s without exposing its material", async (kind) => {
    const harness = createHarness();
    const sourceMaterial = `unsafe-${kind}-material`;

    const result = await harness.assess({
      posture: currentPosture(),
      officialFlow: { kind, material: sourceMaterial }
    });

    expect(result).toMatchObject({
      kind: "blocked",
      category: "prohibited-credential-source",
      safeDiagnosticCodes: ["prohibited-credential-source"]
    });
    expect(JSON.stringify(result)).not.toContain(sourceMaterial);
  });

  it("fails closed on a stale policy before classifying absent official flow", async () => {
    const harness = createHarness();

    const result = await harness.assess(absentAssessment(currentPosture({
      policy: {
        ...currentPosture().policy,
        policyVersion: "policy_codex_harness_v2"
      }
    })));

    expect(result).toMatchObject({
      kind: "blocked",
      category: "posture-mismatch",
      safeDiagnosticCodes: ["posture-mismatch"]
    });
  });

  it.each([
    ["approval", currentPosture({
      approval: {
        ...currentPosture().approval,
        bindingHash: documentationHash
      }
    })],
    ["credential kind", currentPosture({
      credentialReference: {
        ...currentPosture().credentialReference,
        credentialKind: "device-code-oauth" as const
      }
    })]
  ])("fails closed for a swapped %s posture binding before classifying absent flow", async (_binding, posture) => {
    const harness = createHarness();

    const result = await harness.assess(absentAssessment(posture));

    expect(result).toMatchObject({
      kind: "blocked",
      category: "posture-mismatch",
      safeDiagnosticCodes: ["posture-mismatch"]
    });
  });

  it("rejects persistence ports, malformed postures, causation faults, and extra keys", async () => {
    const callbackCalls = [0, 0, 0, 0, 0];
    const persistenceCallback = (index: number) => async () => {
      callbackCalls[index] = (callbackCalls[index] ?? 0) + 1;
      return { kind: "appended" as const };
    };
    const persistencePorts = [
      { append: persistenceCallback(0) },
      { feasibilityAuthority: { appendOfficialFlowUnavailable: persistenceCallback(1) } },
      { mountedOwner: { append: persistenceCallback(2) } },
      { ledger: { append: persistenceCallback(3) } },
      { runtimeHandle: { persist: persistenceCallback(4) } }
    ];
    for (const port of persistencePorts) {
      const result = await createHarness({ currentPosture: currentPosture(), ...port }).assess(absentAssessment());
      expect(result).toMatchObject({ kind: "blocked", category: "unsafe-input", safeDiagnosticCodes: ["unsafe-input"] });
    }

    const harness = createHarness();
    for (const port of persistencePorts) {
      const result = await harness.assess({ ...absentAssessment(), ...port });
      expect(result).toMatchObject({ kind: "blocked", category: "unsafe-input", safeDiagnosticCodes: ["unsafe-input"] });
    }

    const { causationEventId: _causationEventId, ...postureWithoutCausation } = currentPosture();
    const revokedScopes = Proxy.revocable(["harness-execution"], {});
    revokedScopes.revoke();
    for (const assessment of [
      absentAssessment(postureWithoutCausation),
      absentAssessment(currentPosture({ causationEventId: "evt_missing_primary" })),
      absentAssessment(currentPosture({
        credentialReference: {
          ...currentPosture().credentialReference,
          capabilityScopes: revokedScopes.proxy
        }
      })),
      { ...absentAssessment(), unexpected: true }
    ]) {
      const result = await harness.assess(assessment);
      expect(result).toMatchObject({ kind: "blocked", category: "unsafe-input", safeDiagnosticCodes: ["unsafe-input"] });
    }

    const revokedAssessment = Proxy.revocable(absentAssessment(), {});
    revokedAssessment.revoke();
    await expect(harness.assess(revokedAssessment.proxy)).resolves.toMatchObject({
      kind: "blocked",
      category: "unsafe-input",
      safeDiagnosticCodes: ["unsafe-input"]
    });

    const xaiPosture = currentPosture({
      providerId: "provider_xai_primary",
      credentialReference: {
        ...currentPosture().credentialReference,
        providerId: "provider_xai_primary"
      },
      policy: {
        ...currentPosture().policy,
        providerId: "provider_xai_primary"
      }
    });
    await expect(createHarness({ currentPosture: xaiPosture }).assess(absentAssessment(xaiPosture))).resolves.toMatchObject({
      kind: "blocked",
      category: "unsafe-input",
      safeDiagnosticCodes: ["unsafe-input"]
    });

    await expect(harness.assess(absentAssessment(currentPosture({
      causationEventId: "evt_approval_primary"
    })))).resolves.toMatchObject({
      kind: "blocked",
      category: "posture-mismatch",
      safeDiagnosticCodes: ["posture-mismatch"]
    });
    expect(callbackCalls).toEqual([0, 0, 0, 0, 0]);
  });

  it("permits a test-only official route to demonstrate the interface without claiming Codex feasibility", async () => {
    const harness = createHarness();

    await expect(harness.assess({
      posture: currentPosture(),
      officialFlow: {
        kind: "test-official-codex-route",
        officialFlowId: "codex-official-mismatched-workflow.v1",
        documentationHash,
        interfaceOnly: true
      }
    })).resolves.toMatchObject({
      kind: "blocked",
      category: "posture-mismatch",
      safeDiagnosticCodes: ["posture-mismatch"]
    });

    const result = await harness.assess({
      posture: currentPosture(),
      officialFlow: {
        kind: "test-official-codex-route",
        officialFlowId: "codex-official-local-workflow.v1",
        documentationHash,
        interfaceOnly: true
      }
    });

    expect(result).toEqual({
      kind: "interface-demonstrated",
      category: "official-flow-interface-only",
      actualCodexFeasibility: false,
      providerId: "provider_openai_codex_primary",
      modelId: "codex-latest",
      capabilityHash,
      safeDiagnosticCodes: ["official-flow-interface-only"]
    });
    expect(JSON.stringify(result)).not.toMatch(/token|cookie|session|authorization|bearer/i);
  });
});
