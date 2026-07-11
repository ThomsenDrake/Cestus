import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import {
  assertResolvedContextPacksForExecution,
  buildContextPackRef,
  createContextPackRegistry
} from "../src/context-packs.js";
import type { ContextPackRef } from "../src/context-packs.js";
import {
  assertPromptArtifactCanTransferToRemoteProvider,
  buildPromptArtifact,
  createPromptArtifactResolver,
  createPromptArtifactTemplateRegistry,
  parsePromptArtifactEnvelope,
  promptArtifactAuditMetadata,
  serializePromptArtifactEnvelope
} from "../src/prompt-artifacts.js";
import { productionSpecialistPromptRegistrationFor } from "../src/production-specialist-prompts.js";

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

const contextPackRegistry = createContextPackRegistry();
contextPackRegistry.register({
  descriptor: {
    contextPackId: "evidence-summary.v1",
    version: 1,
    label: "Evidence summary",
    maxBytes: 16_384,
    requiredProvenanceKinds: ["event-id"],
    redactionPolicy: "safe-summary",
    sourceProjection: "agent.projection"
  },
  build: () => ({
    contextPackId: "evidence-summary.v1",
    version: 1,
    generatedAt: "2026-07-10T12:00:00.000Z",
    payload: { fact: "payload-only-fact" },
    safeSummary: "One verified evidence summary.",
    provenanceRefs: ["evt_evidence_summary_001"]
  }),
  parsePayload: (payload) => payload
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

  it("binds production renderer metadata and resolved payload audits without exposing payloads in audit metadata", async () => {
    const verifiedResolvedEvidenceSummary = await contextPackRegistry.buildResolved("evidence-summary.v1");
    const contextPackRef = verifiedResolvedEvidenceSummary.ref;
    const verifiedResolvedContextPacks = assertResolvedContextPacksForExecution(
      [contextPackRef],
      [verifiedResolvedEvidenceSummary]
    );
    expect(verifiedResolvedContextPacks).toHaveLength(1);
    expect(verifiedResolvedContextPacks[0]).toBe(verifiedResolvedEvidenceSummary);
    const registration = productionSpecialistPromptRegistrationFor("evidence-triage");
    const envelope = buildPromptArtifact({
      promptTemplateId: registration.promptTemplateId,
      promptTemplateVersion: registration.promptTemplateVersion,
      generatedAt: "2026-07-10T12:00:00.000Z",
      runType: "evidence-triage",
      safetyClass: "provider-approved",
      transferApprovalClass: "provider-byte-transfer",
      contextPackRefs: [contextPackRef],
      text: "Rendered prompt contains bounded payload content.",
      safeSummary: "Provider-approved evidence triage prompt artifact.",
      production: {
        rendererId: registration.rendererId,
        rendererVersion: registration.rendererVersion,
        rendererHash: registration.rendererHash,
        renderedPromptHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        providerOutputSchemaId: registration.providerOutputSchemaId,
        providerOutputSchemaVersion: registration.providerOutputSchemaVersion,
        handoffSchemaId: registration.handoffSchemaId,
        handoffSchemaVersion: registration.handoffSchemaVersion,
        scopeApplicabilityHash: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        evaluatedContextRequirements: [{
          contextPackId: "evidence-summary.v1",
          requirementMode: "always",
          status: "applicable",
          contentHash: contextPackRef.contentHash
        }],
        resolvedPayloadAudits: [{
          contextPackId: "evidence-summary.v1",
          contentHash: contextPackRef.contentHash,
          sizeBytes: contextPackRef.sizeBytes,
          schemaId: "evidence-summary.v1"
        }]
      },
      resolvedContextPacks: [verifiedResolvedEvidenceSummary]
    });

    const audit = promptArtifactAuditMetadata(envelope);
    expect(audit.production?.renderedPromptHash).toMatch(/^sha256:/);
    expect(JSON.stringify(audit)).not.toContain("payload-only-fact");
    expect(JSON.stringify(audit)).not.toContain("Rendered prompt contains bounded payload content");
    expect(envelope.resolvedContextPacks?.[0]).toBe(verifiedResolvedEvidenceSummary);
  });

  it.each([
    ["text", (serialized: { text: string }) => { serialized.text = "Tampered provider prompt text."; }],
    ["rendered prompt hash", (serialized: { manifest: { production: { renderedPromptHash: string } } }) => { serialized.manifest.production.renderedPromptHash = "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"; }],
    ["scope applicability hash", (serialized: { manifest: { production: { scopeApplicabilityHash: string } } }) => { serialized.manifest.production.scopeApplicabilityHash = "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"; }]
  ])("rejects serialized production artifact tampering of %s", async (_field, tamper) => {
    const verifiedResolvedEvidenceSummary = await contextPackRegistry.buildResolved("evidence-summary.v1");
    const registration = productionSpecialistPromptRegistrationFor("evidence-triage");
    const envelope = buildPromptArtifact({
      promptTemplateId: registration.promptTemplateId,
      promptTemplateVersion: registration.promptTemplateVersion,
      generatedAt: "2026-07-10T12:00:00.000Z",
      runType: "evidence-triage",
      safetyClass: "provider-approved",
      transferApprovalClass: "provider-byte-transfer",
      contextPackRefs: [verifiedResolvedEvidenceSummary.ref],
      text: "Rendered prompt contains bounded payload content.",
      safeSummary: "Provider-approved evidence triage prompt artifact.",
      production: productionBinding(verifiedResolvedEvidenceSummary.ref),
      resolvedContextPacks: [verifiedResolvedEvidenceSummary]
    });
    const serialized = JSON.parse(Buffer.from(serializePromptArtifactEnvelope(envelope)).toString("utf8"));

    tamper(serialized);

    expect(() => parsePromptArtifactEnvelope(Buffer.from(JSON.stringify(serialized)))).toThrow(/hash mismatch/i);
  });

  it("rejects forged and reloaded resolved packs for production artifact construction", async () => {
    const verifiedResolvedEvidenceSummary = await contextPackRegistry.buildResolved("evidence-summary.v1");
    const baseInput = {
      promptTemplateId: "evidence-triage.classify.v1",
      promptTemplateVersion: 1,
      generatedAt: "2026-07-10T12:00:00.000Z",
      runType: "evidence-triage" as const,
      safetyClass: "provider-approved" as const,
      transferApprovalClass: "provider-byte-transfer" as const,
      contextPackRefs: [verifiedResolvedEvidenceSummary.ref],
      text: "Rendered prompt contains bounded payload content.",
      safeSummary: "Provider-approved evidence triage prompt artifact.",
      production: productionBinding(verifiedResolvedEvidenceSummary.ref)
    };
    const forged = { ...verifiedResolvedEvidenceSummary };
    const reloaded = JSON.parse(JSON.stringify(verifiedResolvedEvidenceSummary));

    expect(() => buildPromptArtifact({ ...baseInput, resolvedContextPacks: [forged] as never })).toThrow(/unverified|verified/i);
    expect(() => buildPromptArtifact({ ...baseInput, resolvedContextPacks: [reloaded] as never })).toThrow(/unverified|verified/i);
    expect(() => buildPromptArtifact(baseInput)).toThrow(/require.*resolved/i);
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

function productionBinding(contextPackRef: ContextPackRef) {
  const registration = productionSpecialistPromptRegistrationFor("evidence-triage");
  return {
    rendererId: registration.rendererId,
    rendererVersion: registration.rendererVersion,
    rendererHash: registration.rendererHash,
    renderedPromptHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    providerOutputSchemaId: registration.providerOutputSchemaId,
    providerOutputSchemaVersion: registration.providerOutputSchemaVersion,
    handoffSchemaId: registration.handoffSchemaId,
    handoffSchemaVersion: registration.handoffSchemaVersion,
    scopeApplicabilityHash: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    evaluatedContextRequirements: [{
      contextPackId: "evidence-summary.v1",
      requirementMode: "always" as const,
      status: "applicable" as const,
      contentHash: contextPackRef.contentHash
    }],
    resolvedPayloadAudits: [{
      contextPackId: "evidence-summary.v1",
      contentHash: contextPackRef.contentHash,
      sizeBytes: contextPackRef.sizeBytes,
      schemaId: "evidence-summary.v1"
    }]
  };
}

function unsafeCredentialLikeText(): string {
  return ["Author", "ization", ": ", "Bear", "er", " ", "raw-provider-material"].join("");
}
