import { describe, expect, it } from "vitest";
import { createByokProviderAuthorityReader, createByokProviderBoundary } from "../src/byok-provider.js";
import { createCredentialReference } from "../src/credential-reference.js";
import { createProviderCapabilityDescriptor } from "../src/provider-registry.js";

const hashes = Object.freeze({
  prompt: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  capability: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  preview: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
  forgedPrompt: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
  forgedCapability: "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
});

describe("CF-1 BYOK authority-reader boundary", () => {
  it("derives one exact current BYOK posture from the injected reader and returns transfer approval only", () => {
    const reads: unknown[] = [];
    const boundary = createByokProviderBoundary(createByokProviderAuthorityReader((requestedUse) => {
      reads.push(requestedUse);
      return authority();
    }));

    const result = boundary.evaluate(requestedUse());

    expect(result).toEqual({
      kind: "approval-required",
      category: "provider-byte-transfer-required",
      safeActionId: "action_request_provider_byte_transfer",
      selection: {
        providerId: "provider_vendor_byok",
        modelId: "vendor-vision-1",
        adapterVersion: "vendor-openai-compatible.v1",
        credentialRefId: "agent_credref_vendor_byok",
        endpointPolicyId: "endpoint_policy_vendor_byok",
        policyVersion: "policy_byok_v1"
      }
    });
    expect(reads).toEqual([requestedUse()]);
    expect(Object.isFrozen(reads[0]!)).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/authorization|bearer|api[ _-]?key|https?:\/\//i);
  });

  it("rejects an all-self-consistent caller-forged posture before the canonical reader runs", () => {
    let reads = 0;
    const boundary = createByokProviderBoundary(createByokProviderAuthorityReader(() => {
      reads += 1;
      return authority();
    }));
    const forged = authority("forged");
    const result = boundary.evaluate({
      ...requestedUse(),
      ...forged
    });

    expect(result).toEqual({
      kind: "blocked",
      category: "unsafe-input",
      safeActionId: "action_review_byok_provider"
    });
    expect(reads).toBe(0);
    expect(JSON.stringify(result)).not.toMatch(/forged|authorization|bearer|api[ _-]?key|https?:\/\//i);
  });

  it("blocks malformed public requested use when the authority reader is absent", () => {
    const boundary = createByokProviderBoundary(undefined);

    expect(boundary.evaluate({ ...requestedUse(), policyVersion: "https://forged.example.invalid" })).toEqual({
      kind: "blocked",
      category: "unsafe-input",
      safeActionId: "action_review_byok_provider"
    });
  });

  it("blocks malformed public requested use without invoking a forged authority reader", () => {
    let forgedReaderCalls = 0;
    const forgedReader = {
      version: "ByokProviderAuthorityReader.v1" as const,
      readCurrentByokProviderAuthority: () => {
        forgedReaderCalls += 1;
        return authority();
      }
    };
    const boundary = createByokProviderBoundary(forgedReader);

    expect(boundary.evaluate({ ...requestedUse(), policyVersion: "https://forged.example.invalid" })).toEqual({
      kind: "blocked",
      category: "unsafe-input",
      safeActionId: "action_review_byok_provider"
    });
    expect(forgedReaderCalls).toBe(0);
  });

  it("fails closed when requested workspace, mount, task, attempt, run, prompt, preview, or policy differs from reader-derived current preparation", () => {
    const boundary = createByokProviderBoundary(createByokProviderAuthorityReader(() => authority()));

    for (const [field, value] of [
      ["workspaceId", "workspace_other"],
      ["mountInstanceId", "mount_other"],
      ["taskId", "task_other"],
      ["attemptId", "attempt_other"],
      ["runId", "run_other"],
      ["promptArtifactHash", hashes.forgedPrompt],
      ["approvalPreviewHash", hashes.forgedCapability],
      ["policyVersion", "policy_other_v1"]
    ] as const) {
      expect(boundary.evaluate({ ...requestedUse(), [field]: value })).toEqual(authorityReaderUnavailable());
    }
  });

  it("fails safe-unavailable for absent, malformed, or throwing reader capabilities without secret, provider, network, ledger, or portable effects", () => {
    const malformed = createByokProviderBoundary({
      version: "ByokProviderAuthorityReader.v1",
      readCurrentByokProviderAuthority: () => authority()
    });
    const absent = createByokProviderBoundary(undefined);
    const throwing = createByokProviderBoundary(createByokProviderAuthorityReader(() => {
      throw new Error("Bearer fixture-material-never-accepted");
    }));

    const expected = {
      kind: "unavailable",
      category: "authority-reader-unavailable",
      safeActionId: "action_check_provider_health"
    };
    expect(malformed.evaluate(requestedUse())).toEqual(expected);
    expect(absent.evaluate(requestedUse())).toEqual(expected);
    const result = throwing.evaluate(requestedUse());
    expect(result).toEqual(expected);
    expect(JSON.stringify(result)).not.toContain("fixture-material-never-accepted");
  });

  it("returns secret-safe credential unavailable outcomes from reader-derived references only", () => {
    const missingAuthority = { ...authority(), credentialReference: undefined };
    const revokedAuthority = authority();
    revokedAuthority.credentialReference = {
      ...revokedAuthority.credentialReference!,
      status: "revoked"
    };

    expect(createByokProviderBoundary(createByokProviderAuthorityReader(() => missingAuthority)).evaluate(requestedUse()))
      .toEqual({
        kind: "unavailable",
        category: "credential-reference-missing",
        safeActionId: "action_link_provider_credential"
      });
    expect(createByokProviderBoundary(createByokProviderAuthorityReader(() => revokedAuthority)).evaluate(requestedUse()))
      .toEqual({
        kind: "unavailable",
        category: "credential-reference-revoked",
        safeActionId: "action_relink_provider_credential"
      });
  });

  it("fails closed for malformed or generic OpenAI-compatible reader posture instead of falling back to generic readiness", () => {
    const capabilityMismatch = authority();
    capabilityMismatch.capabilityEvidence = {
      ...capabilityMismatch.capabilityEvidence,
      capabilityHash: hashes.forgedCapability
    };
    const genericFallback = authority();
    genericFallback.capability = {
      ...genericFallback.capability,
      fakeSupport: true
    };

    for (const canonical of [capabilityMismatch, genericFallback]) {
      expect(createByokProviderBoundary(createByokProviderAuthorityReader(() => canonical)).evaluate(requestedUse()))
        .toEqual(authorityReaderUnavailable());
    }
  });

  it("fails closed as authority-reader-unavailable when reader-derived authority facts are swapped or stale", () => {
    const swappedCapability = authority();
    swappedCapability.capability = {
      ...swappedCapability.capability,
      providerId: "provider_swapped_byok"
    };

    const swappedEndpointPolicy = authority();
    swappedEndpointPolicy.endpointPolicy = {
      ...swappedEndpointPolicy.endpointPolicy,
      endpointPolicyId: "endpoint_policy_swapped"
    };

    const swappedCapabilityEvidence = [
      ["capabilityHash", hashes.forgedCapability],
      ["capabilitySourceEventId", "evt_capability_swapped"],
      ["capabilityRevision", "revision_swapped_v1"]
    ] as const;
    const staleCurrentUse = [
      ["workspaceId", "workspace_stale"],
      ["mountInstanceId", "mount_stale"],
      ["taskId", "task_stale"],
      ["attemptId", "attempt_stale"],
      ["runId", "run_stale"],
      ["promptArtifactHash", hashes.forgedPrompt],
      ["approvalPreviewHash", hashes.forgedCapability],
      ["policyVersion", "policy_stale_v1"]
    ] as const;
    const readerAuthorities = [swappedCapability, swappedEndpointPolicy];

    for (const [field, value] of swappedCapabilityEvidence) {
      const readerAuthority = authority();
      readerAuthority.capabilityEvidence = {
        ...readerAuthority.capabilityEvidence,
        [field]: value
      };
      readerAuthorities.push(readerAuthority);
    }
    for (const [field, value] of staleCurrentUse) {
      const stalePreparation = authority();
      stalePreparation.preparation = {
        ...stalePreparation.preparation,
        [field]: value
      };
      readerAuthorities.push(stalePreparation);

      const staleCurrent = authority();
      staleCurrent.current = {
        ...staleCurrent.current,
        [field]: value
      };
      readerAuthorities.push(staleCurrent);
    }

    for (const credentialReference of [
      {
        credentialRefId: "agent_credref_swapped_byok"
      },
      {
        sourceEventIds: ["evt_ref_swapped"]
      }
    ]) {
      const swappedCredentialReference = authority();
      swappedCredentialReference.credentialReference = {
        ...swappedCredentialReference.credentialReference!,
        ...credentialReference
      };
      readerAuthorities.push(swappedCredentialReference);
    }

    for (const readerAuthority of readerAuthorities) {
      expect(createByokProviderBoundary(createByokProviderAuthorityReader(() => readerAuthority)).evaluate(requestedUse()))
        .toEqual(authorityReaderUnavailable());
    }
  });

  it("rejects hostile accessor, symbol, and non-plain authority outputs without invoking forbidden effects", () => {
    const accessorEffects = forbiddenEffects();
    const accessorAuthority = Object.defineProperty({}, "selection", {
      enumerable: true,
      get() {
        recordForbiddenEffects(accessorEffects);
        return authority().selection;
      }
    });

    const symbolEffects = forbiddenEffects();
    const symbolAuthority = Object.defineProperty(authority(), Symbol("hostile-reader-output"), {
      enumerable: true,
      get() {
        recordForbiddenEffects(symbolEffects);
        return authority();
      }
    });

    const inheritedEffects = forbiddenEffects();
    const inheritedAuthority = Object.create(Object.defineProperty({}, "selection", {
      enumerable: true,
      get() {
        recordForbiddenEffects(inheritedEffects);
        return authority().selection;
      }
    }));

    for (const [readerAuthority, effects] of [
      [accessorAuthority, accessorEffects],
      [symbolAuthority, symbolEffects],
      [inheritedAuthority, inheritedEffects]
    ] as const) {
      const result = createByokProviderBoundary(createByokProviderAuthorityReader(() => readerAuthority))
        .evaluate(requestedUse());

      expect(result).toEqual(authorityReaderUnavailable());
      expect(effects).toEqual({
        secretResolutions: 0,
        providerCalls: 0,
        networkCalls: 0,
        ledgerAppends: 0,
        portableWrites: 0
      });
      expect(JSON.stringify(result)).not.toMatch(/authorization|bearer|api[ _-]?key|https?:\/\//i);
    }
  });

  it("does not invoke hostile public getters or the reader before strict own-data normalization rejects the request", () => {
    let getterCalls = 0;
    let readerCalls = 0;
    const boundary = createByokProviderBoundary(createByokProviderAuthorityReader(() => {
      readerCalls += 1;
      return authority();
    }));
    const hostile = Object.defineProperty(requestedUse(), "selection", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return authority("forged").selection;
      }
    });

    expect(boundary.evaluate(hostile)).toEqual({
      kind: "blocked",
      category: "unsafe-input",
      safeActionId: "action_review_byok_provider"
    });
    expect(getterCalls).toBe(0);
    expect(readerCalls).toBe(0);
  });
});

function requestedUse() {
  return {
    workspaceId: "workspace_case",
    mountInstanceId: "mount_case",
    taskId: "task_byok",
    attemptId: "attempt_byok",
    runId: "run_byok",
    promptArtifactHash: hashes.prompt,
    approvalPreviewHash: hashes.preview,
    policyVersion: "policy_byok_v1"
  };
}

function authority(prefix = "vendor") {
  const providerId = `provider_${prefix}_byok`;
  const modelId = `${prefix}-vision-1`;
  const adapterVersion = `${prefix}-openai-compatible.v1`;
  const credentialRefId = `agent_credref_${prefix}_byok`;
  const endpointPolicyId = `endpoint_policy_${prefix}_byok`;
  const capabilitySourceEventId = `evt_capability_${prefix}`;
  const credentialSourceEventId = `evt_ref_${prefix}`;
  const capabilityRevision = `revision_${prefix}_v1`;
  const policyVersion = `policy_${prefix}_v1`;
  const use = prefix === "vendor"
    ? requestedUse()
    : {
      workspaceId: "workspace_forged",
      mountInstanceId: "mount_forged",
      taskId: "task_forged",
      attemptId: "attempt_forged",
      runId: "run_forged",
      promptArtifactHash: hashes.forgedPrompt,
      approvalPreviewHash: hashes.forgedCapability,
      policyVersion
    };
  const capabilityHash = prefix === "vendor" ? hashes.capability : hashes.forgedCapability;
  const selection = {
    providerId,
    modelId,
    adapterVersion,
    capabilityVersion: "agent-provider-capability.v2" as const,
    capabilityHash,
    capabilitySourceEventId,
    capabilityRevision,
    credentialRefId,
    credentialSourceEventIds: [credentialSourceEventId],
    endpointPolicyId,
    workspaceId: use.workspaceId,
    taskId: use.taskId,
    attemptId: use.attemptId,
    approvalPreviewHash: use.approvalPreviewHash,
    policyVersion: use.policyVersion
  };

  return {
    selection,
    capability: createProviderCapabilityDescriptor({
      providerId,
      label: `${prefix} remote provider`,
      adapterVersion,
      backendKind: "openai-compatible-api",
      modelFamilies: [modelId],
      modalities: ["text", "image"],
      toolSupport: "function-calling",
      structuredOutputSupport: "schema-strict",
      contextLimits: { maxInputTokens: 8192, maxOutputTokens: 2048 },
      credentialRequirements: [{ credentialKind: "api-key-bearer", required: true }],
      dataHandlingNotes: "Remote inference remains independently approval-gated.",
      costPolicy: "metered-api",
      workspaceScopes: ["workspace"],
      approvalProfile: "remote-byte-transfer-gated",
      diagnosticContract: ["requires-byte-transfer-approval"],
      fakeSupport: false
    }),
    capabilityEvidence: {
      capabilityVersion: "agent-provider-capability.v2" as const,
      capabilityHash,
      capabilitySourceEventId,
      capabilityRevision
    },
    credentialReference: createCredentialReference({
      credentialRefId,
      providerId,
      credentialKind: "api-key-bearer",
      scopeKind: "workspace",
      capabilityScopes: ["model-inference"],
      safeLabel: `${prefix} remote inference access`,
      authorizedBy: "operator_default",
      authorizedAt: "2026-07-14T00:00:00.000Z",
      status: "healthy",
      policyVersion: use.policyVersion,
      sourceEventIds: [credentialSourceEventId]
    }),
    endpointPolicy: {
      endpointPolicyId,
      providerId,
      modelId,
      adapterVersion,
      scope: "exact-provider-model" as const,
      status: "approved" as const
    },
    current: use,
    preparation: {
      ...selection,
      preparationVersion: "agent-provider-invocation-preparation.v1" as const,
      residentAgentId: "agent_default" as const,
      mountInstanceId: use.mountInstanceId,
      runId: use.runId,
      promptArtifactHash: use.promptArtifactHash
    }
  };
}

function authorityReaderUnavailable() {
  return {
    kind: "unavailable" as const,
    category: "authority-reader-unavailable" as const,
    safeActionId: "action_check_provider_health" as const
  };
}

function forbiddenEffects() {
  return {
    secretResolutions: 0,
    providerCalls: 0,
    networkCalls: 0,
    ledgerAppends: 0,
    portableWrites: 0
  };
}

function recordForbiddenEffects(effects: ReturnType<typeof forbiddenEffects>) {
  effects.secretResolutions += 1;
  effects.providerCalls += 1;
  effects.networkCalls += 1;
  effects.ledgerAppends += 1;
  effects.portableWrites += 1;
}
