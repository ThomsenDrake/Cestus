import { describe, expect, it } from "vitest";
import {
  createOfficialFlowAbsenceWitness,
  inspectOfficialFlowAbsenceWitness
} from "../src/official-flow-feasibility.js";

const hashB = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const hashC = "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
const attemptId = `attempt_${"a".repeat(64)}`;

describe("official-flow feasibility", () => {
  it("issues a frozen Codex absence witness with no durable posture fields", () => {
    const witness = createOfficialFlowAbsenceWitness(codexInput());

    expect(witness).toEqual({
      schemaVersion: "agent-official-flow-absence-witness.v1",
      providerFamily: "codex"
    });
    expect(Object.isFrozen(witness)).toBe(true);
    expect(inspectOfficialFlowAbsenceWitness(witness)).toMatchObject({
      providerFamily: "codex",
      classification: "official-flow-absent"
    });
  });

  it("issues a frozen xAI absence witness", () => {
    const witness = createOfficialFlowAbsenceWitness(xaiInput());
    expect(inspectOfficialFlowAbsenceWitness(witness)).toMatchObject({
      providerFamily: "xai",
      providerId: "provider_xai_review",
      officialFlowId: "xai-review"
    });
  });

  it("reproduces the canonical classification JSON hash vector", () => {
    const classification = inspectOfficialFlowAbsenceWitness(createOfficialFlowAbsenceWitness(codexInput()));
    expect(JSON.stringify(classification)).toBe(
      '{"schemaVersion":"agent-official-flow-absence.v1","residentAgentId":"agent_default","workspaceId":"ws_review","mountInstanceId":"mount_review","taskId":"task_review","attemptId":"attempt_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","runId":"run_review","providerFamily":"codex","providerId":"provider_openai_codex_review","modelId":"codex-review","capabilityHash":"sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","credentialRefId":"agent_credref_review","credentialKind":"subscription-oauth","capabilityScopes":["harness-execution"],"policyVersion":"policy_review.v1","officialFlowId":"codex-review","approvalClass":"provider-byte-transfer","approvalBindingHash":"sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","sourceEventIds":["evt_approval_review","evt_checkpoint_review"],"causationEventId":"evt_checkpoint_review","classification":"official-flow-absent","classificationHash":"sha256:bdae51eff3aedbc86bdec0de666fde4019fc6f920ae23ba09ac06211fa9eb8b6"}'
    );
  });

  it("rejects the provisional workspace prefix", () => {
    expect(() => createOfficialFlowAbsenceWitness(patchInput({ workspaceId: "workspace_review" }))).toThrow();
  });

  it("rejects configured and assessed posture disagreement", () => {
    const input = codexInput();
    expect(() => createOfficialFlowAbsenceWitness({
      ...input,
      assessedPosture: { ...input.assessedPosture, modelId: "codex-other" }
    })).toThrow();
  });

  it("rejects a provider-family and provider-id mismatch", () => {
    expect(() => createOfficialFlowAbsenceWitness(patchInput({ providerFamily: "xai" }))).toThrow();
  });

  it("rejects a provider-family and official-flow mismatch", () => {
    expect(() => createOfficialFlowAbsenceWitness(patchInput({ officialFlowId: "xai-review" }))).toThrow();
  });

  it("requires the exact attempt identifier form", () => {
    expect(() => createOfficialFlowAbsenceWitness(patchInput({ attemptId: "attempt_short" }))).toThrow();
  });

  it("requires officialFlow to be undefined", () => {
    expect(() => createOfficialFlowAbsenceWitness({ ...codexInput(), officialFlow: null } as never)).toThrow();
  });

  it("rejects unknown and secret-shaped posture values", () => {
    expect(() => createOfficialFlowAbsenceWitness({
      ...codexInput(),
      configuredPosture: { ...codexInput().configuredPosture, unexpected: true }
    } as never)).toThrow();
    expect(() => createOfficialFlowAbsenceWitness(patchInput({ modelId: "authorization: bearer secret" }))).toThrow();
  });

  it("rejects accessor custom-prototype symbol and sparse external values", () => {
    const accessor = {} as Record<string, unknown>;
    Object.defineProperty(accessor, "configuredPosture", { enumerable: true, get: () => codexInput().configuredPosture });
    Object.defineProperty(accessor, "assessedPosture", { enumerable: true, get: () => codexInput().assessedPosture });
    Object.defineProperty(accessor, "officialFlow", { enumerable: true, value: undefined });
    expect(() => createOfficialFlowAbsenceWitness(accessor)).toThrow();
    expect(() => createOfficialFlowAbsenceWitness(Object.create(codexInput()))).toThrow();
    expect(() => createOfficialFlowAbsenceWitness({ ...codexInput(), [Symbol("unexpected")]: true })).toThrow();
    const sparse = ["harness-execution", ,] as unknown as string[];
    expect(() => createOfficialFlowAbsenceWitness(patchInput({ capabilityScopes: sparse }))).toThrow();
  });

  it("normalizes capability scopes and sources in Unicode order", () => {
    const witness = createOfficialFlowAbsenceWitness(patchInput({
      capabilityScopes: ["zeta", "harness-execution", "alpha"],
      sourceEventIds: ["evt_zeta", "evt_approval_review", "evt_checkpoint_review"],
      causationEventId: "evt_checkpoint_review"
    }));
    expect(inspectOfficialFlowAbsenceWitness(witness)).toMatchObject({
      capabilityScopes: ["alpha", "harness-execution", "zeta"],
      sourceEventIds: ["evt_approval_review", "evt_checkpoint_review", "evt_zeta"]
    });
  });

  it("rejects empty duplicate and causally unbound source sets", () => {
    expect(() => createOfficialFlowAbsenceWitness(patchInput({ sourceEventIds: [] }))).toThrow();
    expect(() => createOfficialFlowAbsenceWitness(patchInput({ sourceEventIds: ["evt_checkpoint_review", "evt_checkpoint_review"] }))).toThrow();
    expect(() => createOfficialFlowAbsenceWitness(patchInput({ causationEventId: "evt_other" }))).toThrow();
  });

  it("does not inspect fabricated or copied witnesses", () => {
    const witness = createOfficialFlowAbsenceWitness(codexInput());
    expect(inspectOfficialFlowAbsenceWitness({ ...witness })).toBeUndefined();
    expect(inspectOfficialFlowAbsenceWitness({
      schemaVersion: "agent-official-flow-absence-witness.v1",
      providerFamily: "codex"
    })).toBeUndefined();
  });

  it("does not inspect serialized or proxied witnesses", () => {
    const witness = createOfficialFlowAbsenceWitness(codexInput());
    expect(inspectOfficialFlowAbsenceWitness(JSON.parse(JSON.stringify(witness)))).toBeUndefined();
    expect(inspectOfficialFlowAbsenceWitness(new Proxy(witness, {}))).toBeUndefined();
  });

  it("keeps classifications process-local and immutable", () => {
    const witness = createOfficialFlowAbsenceWitness(codexInput());
    const classification = inspectOfficialFlowAbsenceWitness(witness);
    expect(classification).toBeDefined();
    expect(Object.isFrozen(classification)).toBe(true);
    expect(Object.isFrozen(classification?.capabilityScopes)).toBe(true);
    expect(Object.isFrozen(classification?.sourceEventIds)).toBe(true);
  });
});

function codexInput(): {
  readonly configuredPosture: Record<string, unknown>;
  readonly assessedPosture: Record<string, unknown>;
  readonly officialFlow: undefined;
} {
  return {
    configuredPosture: codexPosture(),
    assessedPosture: codexPosture(),
    officialFlow: undefined
  };
}

function xaiInput(): Record<string, unknown> {
  return {
    configuredPosture: {
      ...codexPosture(),
      providerFamily: "xai",
      providerId: "provider_xai_review",
      officialFlowId: "xai-review",
      credentialKind: "device-code-oauth"
    },
    assessedPosture: {
      ...codexPosture(),
      providerFamily: "xai",
      providerId: "provider_xai_review",
      officialFlowId: "xai-review",
      credentialKind: "device-code-oauth"
    },
    officialFlow: undefined
  };
}

function patchInput(patch: Record<string, unknown>): Record<string, unknown> {
  return {
    configuredPosture: { ...codexPosture(), ...patch },
    assessedPosture: { ...codexPosture(), ...patch },
    officialFlow: undefined
  };
}

function codexPosture(): Record<string, unknown> {
  return {
    residentAgentId: "agent_default",
    workspaceId: "ws_review",
    mountInstanceId: "mount_review",
    taskId: "task_review",
    attemptId,
    runId: "run_review",
    providerFamily: "codex",
    providerId: "provider_openai_codex_review",
    modelId: "codex-review",
    capabilityHash: hashB,
    credentialRefId: "agent_credref_review",
    credentialKind: "subscription-oauth",
    capabilityScopes: ["harness-execution"],
    policyVersion: "policy_review.v1",
    officialFlowId: "codex-review",
    approvalClass: "provider-byte-transfer",
    approvalBindingHash: hashC,
    sourceEventIds: ["evt_approval_review", "evt_checkpoint_review"],
    causationEventId: "evt_checkpoint_review"
  };
}
