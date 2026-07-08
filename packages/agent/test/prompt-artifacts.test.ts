import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import { buildContextPackRef } from "../src/context-packs.js";
import {
  assertPromptArtifactCanTransferToRemoteProvider,
  buildPromptArtifact,
  createPromptArtifactResolver,
  createPromptArtifactTemplateRegistry,
  parsePromptArtifactEnvelope,
  promptArtifactAuditMetadata,
  serializePromptArtifactEnvelope
} from "../src/prompt-artifacts.js";

const contextPackRef = buildContextPackRef({
  contextPackId: "task-run-history.v1",
  version: 1,
  generatedAt: "2026-07-08T12:00:00.000Z",
  payload: { events: ["evt_agent_task_created"] },
  safeSummary: "One resident-agent task event.",
  provenanceRefs: ["evt_agent_task_created"],
  sourceEventIds: ["evt_agent_task_created"],
  artifactHashes: [],
  policyVersion: "agent-policy-v1",
  scope: { kind: "workspace", id: "ws_case_001" },
  sizeBudgetBytes: 16_384,
  stalenessInputs: [{
    kind: "projection-high-water-mark",
    ref: "agent.projection",
    value: "42"
  }]
});

describe("resident agent prompt artifacts", () => {
  it("binds durable prompt envelopes to context pack refs and audit metadata", () => {
    const envelope = buildPromptArtifact({
      promptTemplateId: "resident-agent-context-pack.v1",
      promptTemplateVersion: 1,
      generatedAt: "2026-07-08T12:01:00.000Z",
      runType: "evidence-triage",
      safetyClass: "provider-approved",
      transferApprovalClass: "provider-byte-transfer",
      contextPackRefs: [contextPackRef],
      text: "Use the listed context pack summaries to answer with provenance.",
      safeSummary: "Provider-approved resident-agent prompt artifact.",
      omissions: [{
        reason: "budget",
        sourceRef: "evidence-summary.v1",
        safeSummary: "One evidence pack was omitted because the size budget was reached."
      }]
    });

    const audit = promptArtifactAuditMetadata(envelope);

    expect(envelope.manifest.inputArtifactHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(audit).toEqual({
      inputArtifactHash: envelope.manifest.inputArtifactHash,
      promptTemplateId: "resident-agent-context-pack.v1",
      promptTemplateVersion: 1,
      runType: "evidence-triage",
      safetyClass: "provider-approved",
      transferApprovalClass: "provider-byte-transfer",
      contextPackRefs: [contextPackRef],
      omissions: envelope.manifest.omissions,
      safeSummary: "Provider-approved resident-agent prompt artifact."
    });
    expect("text" in audit).toBe(false);
    expect(Object.isFrozen(envelope)).toBe(true);
    expect(Object.isFrozen(envelope.manifest)).toBe(true);
    expect(Object.isFrozen(envelope.manifest.contextPackRefs)).toBe(true);
    expect(Object.isFrozen(envelope.manifest.omissions)).toBe(true);
    expect(Object.isFrozen(audit)).toBe(true);
  });

  it("serializes and parses prompt artifact envelopes with stable hash verification", () => {
    const envelope = buildPromptArtifact({
      promptTemplateId: "resident-agent-context-pack.v1",
      promptTemplateVersion: 1,
      generatedAt: "2026-07-08T12:01:00.000Z",
      runType: "evidence-triage",
      safetyClass: "provider-approved",
      transferApprovalClass: "provider-byte-transfer",
      contextPackRefs: [contextPackRef],
      text: "Provider-approved prompt text with safe summaries only.",
      safeSummary: "Provider-approved prompt artifact."
    });

    const serialized = serializePromptArtifactEnvelope(envelope);
    const parsed = parsePromptArtifactEnvelope(serialized);

    expect(parsed).toEqual(envelope);
    expect(Object.isFrozen(parsed.manifest.contextPackRefs[0]?.stalenessInputs)).toBe(true);

    const tampered = JSON.parse(Buffer.from(serialized).toString("utf8")) as {
      manifest: { safeSummary: string };
      text: string;
    };
    tampered.text = "Tampered provider-approved prompt text.";
    expect(() => parsePromptArtifactEnvelope(Buffer.from(JSON.stringify(tampered)))).toThrow(/hash mismatch/i);
  });

  it("rejects unsafe prompt text before it can reach a provider", () => {
    expect(() =>
      buildPromptArtifact({
        promptTemplateId: "resident-agent-context-pack.v1",
        promptTemplateVersion: 1,
        generatedAt: "2026-07-08T12:01:00.000Z",
        runType: "evidence-triage",
        safetyClass: "provider-approved",
        transferApprovalClass: "provider-byte-transfer",
        contextPackRefs: [contextPackRef],
        text: unsafeCredentialLikeText(),
        safeSummary: "Unsafe artifact."
      })
    ).toThrow(/secret-safe/i);
  });

  it("rejects accessor-backed prompt text without invoking the getter", () => {
    let getterInvoked = false;
    const input = {
      promptTemplateId: "resident-agent-context-pack.v1",
      promptTemplateVersion: 1,
      generatedAt: "2026-07-08T12:01:00.000Z",
      runType: "evidence-triage",
      safetyClass: "provider-approved",
      transferApprovalClass: "provider-byte-transfer",
      contextPackRefs: [contextPackRef],
      safeSummary: "Provider-approved prompt artifact."
    };
    Object.defineProperty(input, "text", {
      enumerable: true,
      get() {
        getterInvoked = true;
        return "Accessor text.";
      }
    });

    let thrown: unknown;
    try {
      buildPromptArtifact(input as never);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toMatch(/JSON DTO-safe/i);
    expect(getterInvoked).toBe(false);
  });

  it("blocks raw-content transfer unless provider byte transfer approval is encoded", () => {
    const localOnly = buildPromptArtifact({
      promptTemplateId: "resident-agent-context-pack.v1",
      promptTemplateVersion: 1,
      generatedAt: "2026-07-08T12:01:00.000Z",
      runType: "evidence-triage",
      safetyClass: "sensitive-local-only",
      transferApprovalClass: "none",
      contextPackRefs: [contextPackRef],
      text: "Summarize locally from safe context pack metadata only.",
      safeSummary: "Local-only prompt artifact."
    });

    expect(() => assertPromptArtifactCanTransferToRemoteProvider(localOnly)).toThrow(/provider transfer/i);
  });

  it("resolves only exact known artifact hashes and rejects duplicates", async () => {
    const envelope = buildPromptArtifact({
      promptTemplateId: "resident-agent-context-pack.v1",
      promptTemplateVersion: 1,
      generatedAt: "2026-07-08T12:01:00.000Z",
      runType: "evidence-triage",
      safetyClass: "provider-approved",
      transferApprovalClass: "provider-byte-transfer",
      contextPackRefs: [contextPackRef],
      text: "Provider-approved prompt text with safe summaries only.",
      safeSummary: "Provider-approved prompt artifact."
    });
    const resolver = createPromptArtifactResolver([envelope]);

    await expect(resolver.resolve(envelope.manifest.inputArtifactHash)).resolves.toMatchObject({
      manifest: { inputArtifactHash: envelope.manifest.inputArtifactHash }
    });
    await expect(
      resolver.resolve("sha256:9999999999999999999999999999999999999999999999999999999999999999")
    ).rejects.toThrow(/not found/i);
    expect(() => createPromptArtifactResolver([envelope, envelope])).toThrow(/duplicate/i);
  });

  it("registers prompt templates for all approved specialist run types", () => {
    const registry = createPromptArtifactTemplateRegistry();
    for (const runType of [
      "ontology-bootstrap",
      "prr-negotiation",
      "evidence-triage",
      "timeline-builder",
      "contradiction-finder",
      "investigation-planner",
      "report-builder"
    ] as const) {
      registry.register({
        runType,
        promptTemplateId: `${runType}.context-pack.v1`,
        promptTemplateVersion: 1,
        label: `Context pack assembly for ${runType}`
      });
    }

    expect(registry.snapshot().templates.map((template) => template.runType)).toEqual([
      "ontology-bootstrap",
      "prr-negotiation",
      "evidence-triage",
      "timeline-builder",
      "contradiction-finder",
      "investigation-planner",
      "report-builder"
    ]);
    expect(() =>
      registry.register({
        runType: "evidence-triage",
        promptTemplateId: "evidence-triage.context-pack.v1",
        promptTemplateVersion: 2,
        label: "Duplicate template ID."
      })
    ).toThrow(/already registered/i);
    expect(() =>
      registry.register({
        runType: "legacy-bootstrap" as never,
        promptTemplateId: "legacy-bootstrap.context-pack.v1",
        promptTemplateVersion: 1,
        label: "Unknown context pack assembly."
      })
    ).toThrow(/run type/i);
  });
});

function unsafeCredentialLikeText(): string {
  return ["Author", "ization", ": ", "Bear", "er", " ", "raw-provider-material"].join("");
}
