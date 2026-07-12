import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import {
  assertResolvedContextPacksForExecution,
  buildContextPackRef,
  createContextPackRegistry,
  registerContextPackPayloadParserAuthority
} from "../src/context-packs.js";
import type { AgentContextPackJsonValue, ContextPackRef } from "../src/context-packs.js";
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
import {
  assembleTaskOrchestratorContext,
  assertTaskOrchestratorContextHasNoPayloadBytes
} from "../src/task-orchestrator-context.js";
import { specialistWorkflowDescriptorFor } from "../src/specialist-workflows.js";

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
  parsePayload: permissiveProductionShapedParser("evidence-summary.v1")
});

for (const contextPackId of [
  "governance-locks.v1",
  "accepted-graph-projection.v1",
  "timeline-draft-summary.v1",
  "contradiction-candidate-summary.v1",
  "agent-memory-summary.v1",
  "task-run-history.v1",
  "workspace-runtime-status.v1",
  "prr-read-model.v1",
  "jurisdiction-pack-summary.v1",
  "extra-context.v1"
]) {
  contextPackRegistry.register({
    descriptor: {
      contextPackId,
      version: 1,
      label: `Test ${contextPackId}`,
      maxBytes: 16_384,
      requiredProvenanceKinds: ["event-id"],
      redactionPolicy: "safe-summary",
      sourceProjection: "agent.projection"
    },
    build: () => ({
      contextPackId,
      version: 1,
      generatedAt: "2026-07-10T12:00:00.000Z",
      payload: { contextPackId },
      safeSummary: `One verified ${contextPackId}.`,
      provenanceRefs: ["evt_evidence_summary_001"]
    }),
    parsePayload: permissiveProductionShapedParser(contextPackId)
  });
}

describe("resident agent prompt artifacts", () => {
  it("does not include resolved payload bytes in approval preview or logs", async () => {
    const assembled = await assembleTaskOrchestratorContext({
      taskId: "task_task4_prompt_leakage",
      runType: "evidence-triage",
      scope: { kind: "workspace", refs: ["ws_case_001"] },
      workflow: specialistWorkflowDescriptorFor("evidence-triage"),
      contextRegistry: contextPackRegistry
    });

    assertTaskOrchestratorContextHasNoPayloadBytes(
      [assembled.approvalPreview, assembled.logRecord],
      assembled.resolvedContextPacks
    );
  });
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
    const verifiedResolvedContextPacks = await resolvedEvidenceTriageContextPacks();
    const contextPackRefs = verifiedResolvedContextPacks.map((resolved) => resolved.ref);
    const verifiedResolvedEvidenceSummary = verifiedResolvedContextPacks[0];
    if (verifiedResolvedEvidenceSummary === undefined) {
      throw new Error("Expected evidence summary context pack");
    }
    const contextPackRef = verifiedResolvedEvidenceSummary.ref;
    expect(verifiedResolvedContextPacks).toHaveLength(6);
    expect(verifiedResolvedContextPacks[0]).toBe(verifiedResolvedEvidenceSummary);
    const registration = productionSpecialistPromptRegistrationFor("evidence-triage");
    const envelope = buildPromptArtifact({
      promptTemplateId: registration.promptTemplateId,
      promptTemplateVersion: registration.promptTemplateVersion,
      generatedAt: "2026-07-10T12:00:00.000Z",
      runType: "evidence-triage",
      safetyClass: "provider-approved",
      transferApprovalClass: "provider-byte-transfer",
      contextPackRefs,
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
        evaluatedContextRequirements: evaluatedEvidenceTriageRequirements(contextPackRefs),
        resolvedPayloadAudits: payloadAudits(contextPackRefs)
      },
      resolvedContextPacks: verifiedResolvedContextPacks
    });

    const audit = promptArtifactAuditMetadata(envelope);
    expect(audit.production?.renderedPromptHash).toMatch(/^sha256:/);
    expect(JSON.stringify(audit)).not.toContain("payload-only-fact");
    expect(JSON.stringify(audit)).not.toContain("Rendered prompt contains bounded payload content");
    expect(envelope.resolvedContextPacks?.[0]).toBe(verifiedResolvedEvidenceSummary);
  });

  it("does not let generic construction transfer arbitrary text with a complete production binding", async () => {
    const resolvedContextPacks = await resolvedEvidenceTriageContextPacks();
    const generic = buildProductionEvidenceTriageArtifact({
      contextPackRefs: resolvedContextPacks.map((resolved) => resolved.ref),
      resolvedContextPacks,
      evaluatedContextRequirements: evaluatedEvidenceTriageRequirements(
        resolvedContextPacks.map((resolved) => resolved.ref)
      )
    });

    expect(() => assertPromptArtifactCanTransferToRemoteProvider(generic)).toThrow(/production.*verify|verification|renderer/i);
  });

  it("rejects production-shaped generic artifacts for all six production run types", async () => {
    for (const registration of [
      "prr-negotiation",
      "evidence-triage",
      "timeline-builder",
      "contradiction-finder",
      "investigation-planner",
      "report-builder"
    ] as const) {
      const generic = await genericProductionShapedArtifact(registration);
      expect(() => assertPromptArtifactCanTransferToRemoteProvider(generic)).toThrow(/renderer verification|production renderer verification/i);
    }
  });

  it("does not manufacture verified payload envelopes from serialized production artifacts", async () => {
    const resolvedContextPacks = await resolvedEvidenceTriageContextPacks();
    const contextPackRefs = resolvedContextPacks.map((resolved) => resolved.ref);
    const envelope = buildProductionEvidenceTriageArtifact({
      contextPackRefs,
      resolvedContextPacks,
      evaluatedContextRequirements: evaluatedEvidenceTriageRequirements(contextPackRefs)
    });

    const serialized = serializePromptArtifactEnvelope(envelope);
    const parsed = parsePromptArtifactEnvelope(serialized);

    expect(parsed.resolvedContextPacks).toBeUndefined();
    expect(() => assertResolvedContextPacksForExecution(contextPackRefs, parsed.resolvedContextPacks ?? [])).toThrow(/missing/i);
    expect(JSON.stringify(promptArtifactAuditMetadata(parsed))).not.toContain("payload-only-fact");
  });

  it("keeps execution assertion limited to registry-owned envelopes and its two positional arguments", async () => {
    const resolvedContextPacks = await resolvedEvidenceTriageContextPacks();
    const contextPackRefs = resolvedContextPacks.map((resolved) => resolved.ref);
    const plain = JSON.parse(JSON.stringify(resolvedContextPacks[0])) as unknown;

    expect(assertResolvedContextPacksForExecution.length).toBe(2);
    expect(() => assertResolvedContextPacksForExecution(
      contextPackRefs,
      [plain, ...resolvedContextPacks.slice(1)] as never
    )).toThrow(/unverified|verified/i);
  });

  it("rehydrates production payload envelopes only from supplied registry authority", async () => {
    const resolvedContextPacks = await resolvedEvidenceTriageContextPacks();
    const contextPackRefs = resolvedContextPacks.map((resolved) => resolved.ref);
    const envelope = buildProductionEvidenceTriageArtifact({
      contextPackRefs,
      resolvedContextPacks,
      evaluatedContextRequirements: evaluatedEvidenceTriageRequirements(contextPackRefs)
    });

    const parsed = parsePromptArtifactEnvelope(serializePromptArtifactEnvelope(envelope), {
      authoritativeResolvedContextPacks: resolvedContextPacks
    });

    expect(parsed.resolvedContextPacks).toHaveLength(resolvedContextPacks.length);
    expect(parsed.resolvedContextPacks?.[0]).toBe(resolvedContextPacks[0]);
    expect(parsed.resolvedContextPacks?.map((resolved) => resolved.ref)).toEqual(contextPackRefs);
    expect(() => assertResolvedContextPacksForExecution(contextPackRefs, parsed.resolvedContextPacks ?? [])).not.toThrow();
  });

  it("rejects persisted production payload, ref, and order tampering against registry authority", async () => {
    const resolvedContextPacks = await resolvedEvidenceTriageContextPacks();
    const contextPackRefs = resolvedContextPacks.map((resolved) => resolved.ref);
    const envelope = buildProductionEvidenceTriageArtifact({
      contextPackRefs,
      resolvedContextPacks,
      evaluatedContextRequirements: evaluatedEvidenceTriageRequirements(contextPackRefs)
    });
    const serialized = JSON.parse(Buffer.from(serializePromptArtifactEnvelope(envelope)).toString("utf8")) as {
      resolvedContextPacks: Array<{ ref: ContextPackRef; payload: { fact: string } }>;
    };
    const first = serialized.resolvedContextPacks[0];
    if (first === undefined) throw new Error("Expected persisted evidence summary payload.");
    const tamperedPayload = { fact: "tampered-persisted-payload" };
    const { contentHash: _contentHash, sizeBytes: _sizeBytes, ...tamperedRefInput } = first.ref;
    const tamperedRef = buildContextPackRef({ ...tamperedRefInput, payload: tamperedPayload });
    serialized.resolvedContextPacks[0] = { ref: tamperedRef, payload: tamperedPayload };

    expect(() => parsePromptArtifactEnvelope(Buffer.from(JSON.stringify(serialized)), {
      authoritativeResolvedContextPacks: resolvedContextPacks
    })).toThrow(/authoritative|payload|ref/i);

    const reordered = JSON.parse(Buffer.from(serializePromptArtifactEnvelope(envelope)).toString("utf8")) as {
      resolvedContextPacks: unknown[];
    };
    reordered.resolvedContextPacks.reverse();
    expect(() => parsePromptArtifactEnvelope(Buffer.from(JSON.stringify(reordered)), {
      authoritativeResolvedContextPacks: resolvedContextPacks
    })).toThrow(/authoritative|order|ref/i);

    const missingPayloads = JSON.parse(Buffer.from(serializePromptArtifactEnvelope(envelope)).toString("utf8")) as {
      resolvedContextPacks?: unknown;
    };
    delete missingPayloads.resolvedContextPacks;

    expect(() => parsePromptArtifactEnvelope(Buffer.from(JSON.stringify(missingPayloads)), {
      authoritativeResolvedContextPacks: resolvedContextPacks
    })).toThrow(/resolvedContextPacks/i);
  });

  it.each([
    ["text", (serialized: { text: string }) => { serialized.text = "Tampered provider prompt text."; }],
    ["rendered prompt hash", (serialized: { manifest: { production: { renderedPromptHash: string } } }) => { serialized.manifest.production.renderedPromptHash = "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"; }],
    ["scope applicability hash", (serialized: { manifest: { production: { scopeApplicabilityHash: string } } }) => { serialized.manifest.production.scopeApplicabilityHash = "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"; }]
  ])("rejects serialized production artifact tampering of %s", async (_field, tamper) => {
    const verifiedResolvedContextPacks = await resolvedEvidenceTriageContextPacks();
    const contextPackRefs = verifiedResolvedContextPacks.map((resolved) => resolved.ref);
    const registration = productionSpecialistPromptRegistrationFor("evidence-triage");
    const envelope = buildPromptArtifact({
      promptTemplateId: registration.promptTemplateId,
      promptTemplateVersion: registration.promptTemplateVersion,
      generatedAt: "2026-07-10T12:00:00.000Z",
      runType: "evidence-triage",
      safetyClass: "provider-approved",
      transferApprovalClass: "provider-byte-transfer",
      contextPackRefs,
      text: "Rendered prompt contains bounded payload content.",
      safeSummary: "Provider-approved evidence triage prompt artifact.",
      production: productionBinding(contextPackRefs),
      resolvedContextPacks: verifiedResolvedContextPacks
    });
    const serialized = JSON.parse(Buffer.from(serializePromptArtifactEnvelope(envelope)).toString("utf8"));

    tamper(serialized);

    expect(() => parsePromptArtifactEnvelope(Buffer.from(JSON.stringify(serialized)))).toThrow(/hash mismatch/i);
  });

  it("rejects forged and reloaded resolved packs for production artifact construction", async () => {
    const verifiedResolvedContextPacks = await resolvedEvidenceTriageContextPacks();
    const contextPackRefs = verifiedResolvedContextPacks.map((resolved) => resolved.ref);
    const baseInput = {
      promptTemplateId: "evidence-triage.classify.v1",
      promptTemplateVersion: 1,
      generatedAt: "2026-07-10T12:00:00.000Z",
      runType: "evidence-triage" as const,
      safetyClass: "provider-approved" as const,
      transferApprovalClass: "provider-byte-transfer" as const,
      contextPackRefs,
      text: "Rendered prompt contains bounded payload content.",
      safeSummary: "Provider-approved evidence triage prompt artifact.",
      production: productionBinding(contextPackRefs)
    };
    const firstResolved = verifiedResolvedContextPacks[0];
    if (firstResolved === undefined) {
      throw new Error("Expected evidence summary context pack");
    }
    const forged = { ...firstResolved };
    const reloaded = JSON.parse(JSON.stringify(firstResolved));

    expect(() => buildPromptArtifact({ ...baseInput, resolvedContextPacks: [forged, ...verifiedResolvedContextPacks.slice(1)] as never })).toThrow(/unverified|verified/i);
    expect(() => buildPromptArtifact({ ...baseInput, resolvedContextPacks: [reloaded, ...verifiedResolvedContextPacks.slice(1)] as never })).toThrow(/unverified|verified/i);
    expect(() => buildPromptArtifact(baseInput)).toThrow(/require.*resolved/i);
  });

  it("rejects a partial evaluated requirement list for evidence triage", async () => {
    const resolvedContextPacks = await resolvedEvidenceTriageContextPacks();
    const contextPackRefs = resolvedContextPacks.map((resolved) => resolved.ref);
    const evaluatedContextRequirements = evaluatedEvidenceTriageRequirements(contextPackRefs);

    expect(() => buildProductionEvidenceTriageArtifact({
      contextPackRefs,
      resolvedContextPacks,
      evaluatedContextRequirements: evaluatedContextRequirements.slice(0, 1)
    })).toThrow(/complete|registered|requirement/i);
  });

  it("rejects evaluated requirements that are not in registered order", async () => {
    const resolvedContextPacks = await resolvedEvidenceTriageContextPacks();
    const contextPackRefs = resolvedContextPacks.map((resolved) => resolved.ref);

    expect(() => buildProductionEvidenceTriageArtifact({
      contextPackRefs,
      resolvedContextPacks,
      evaluatedContextRequirements: [...evaluatedEvidenceTriageRequirements(contextPackRefs)].reverse()
    })).toThrow(/order|registered|requirement/i);
  });

  it("rejects a context ref not represented by an applicable registered requirement", async () => {
    const resolvedContextPacks = await resolvedEvidenceTriageContextPacks();
    const extraResolved = await contextPackRegistry.buildResolved("extra-context.v1");
    const contextPackRefs = [...resolvedContextPacks.map((resolved) => resolved.ref), extraResolved.ref];

    expect(() => buildProductionEvidenceTriageArtifact({
      contextPackRefs,
      resolvedContextPacks: [...resolvedContextPacks, extraResolved],
      evaluatedContextRequirements: evaluatedEvidenceTriageRequirements(contextPackRefs)
    })).toThrow(/context pack ref|registered|requirement/i);
  });

  it("permits a conditional PRR requirement to be not applicable only with no-associated-prr", async () => {
    const resolvedContextPacks = await resolvedEvidenceTriageContextPacks();
    const contextPackRefs = resolvedContextPacks.map((resolved) => resolved.ref);
    const evaluatedContextRequirements = evaluatedEvidenceTriageRequirements(contextPackRefs);

    expect(() => buildProductionEvidenceTriageArtifact({
      contextPackRefs,
      resolvedContextPacks,
      evaluatedContextRequirements
    })).not.toThrow();
    expect(() => buildProductionEvidenceTriageArtifact({
      contextPackRefs,
      resolvedContextPacks,
      evaluatedContextRequirements: evaluatedContextRequirements.map((requirement) => requirement.contextPackId === "prr-read-model.v1"
        ? { ...requirement, omissionReason: "not-associated-prr" as never }
        : requirement)
    })).toThrow(/no-associated-prr/i);
  });

  it("preserves the evaluator-supplied scope hash and rejects serialized scope-hash tampering", async () => {
    const resolvedContextPacks = await resolvedEvidenceTriageContextPacks();
    const contextPackRefs = resolvedContextPacks.map((resolved) => resolved.ref);
    const scopeApplicabilityHash = "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
    const envelope = buildProductionEvidenceTriageArtifact({
      contextPackRefs,
      resolvedContextPacks,
      evaluatedContextRequirements: evaluatedEvidenceTriageRequirements(contextPackRefs),
      scopeApplicabilityHash
    });

    expect(envelope.manifest.production?.scopeApplicabilityHash).toBe(scopeApplicabilityHash);
    const serialized = JSON.parse(Buffer.from(serializePromptArtifactEnvelope(envelope)).toString("utf8")) as {
      manifest: { production: { scopeApplicabilityHash: string } };
    };
    serialized.manifest.production.scopeApplicabilityHash = "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
    expect(() => parsePromptArtifactEnvelope(Buffer.from(JSON.stringify(serialized)))).toThrow(/hash mismatch/i);
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

async function resolvedEvidenceTriageContextPacks() {
  const registration = productionSpecialistPromptRegistrationFor("evidence-triage");
  const resolved = await Promise.all(registration.contextRequirements
    .filter((requirement) => requirement.requirementMode === "always")
    .map((requirement) => contextPackRegistry.buildResolved(requirement.contextPackId)));
  return assertResolvedContextPacksForExecution(resolved.map((contextPack) => contextPack.ref), resolved);
}

function evaluatedEvidenceTriageRequirements(contextPackRefs: readonly ContextPackRef[]) {
  const refsById = new Map(contextPackRefs.map((contextPackRef) => [contextPackRef.contextPackId, contextPackRef]));
  return productionSpecialistPromptRegistrationFor("evidence-triage").contextRequirements.map((requirement) => {
    const contextPackRef = refsById.get(requirement.contextPackId);
    return contextPackRef === undefined
      ? {
        contextPackId: requirement.contextPackId,
        requirementMode: requirement.requirementMode,
        status: "not-applicable" as const,
        omissionReason: "no-associated-prr" as const
      }
      : {
        contextPackId: requirement.contextPackId,
        requirementMode: requirement.requirementMode,
        status: "applicable" as const,
        contentHash: contextPackRef.contentHash
      };
  });
}

function payloadAudits(contextPackRefs: readonly ContextPackRef[]) {
  return contextPackRefs.map((contextPackRef) => ({
    contextPackId: contextPackRef.contextPackId,
    contentHash: contextPackRef.contentHash,
    sizeBytes: contextPackRef.sizeBytes,
    schemaId: contextPackRef.contextPackId
  }));
}

function buildProductionEvidenceTriageArtifact(input: {
  readonly contextPackRefs: readonly ContextPackRef[];
  readonly resolvedContextPacks: readonly Awaited<ReturnType<typeof resolvedEvidenceTriageContextPacks>>[number][];
  readonly evaluatedContextRequirements: ReturnType<typeof evaluatedEvidenceTriageRequirements>;
  readonly scopeApplicabilityHash?: string;
}) {
  const registration = productionSpecialistPromptRegistrationFor("evidence-triage");
  return buildPromptArtifact({
    promptTemplateId: registration.promptTemplateId,
    promptTemplateVersion: registration.promptTemplateVersion,
    generatedAt: "2026-07-10T12:00:00.000Z",
    runType: "evidence-triage",
    safetyClass: "provider-approved",
    transferApprovalClass: "provider-byte-transfer",
    contextPackRefs: input.contextPackRefs,
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
      scopeApplicabilityHash: input.scopeApplicabilityHash ?? "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      evaluatedContextRequirements: input.evaluatedContextRequirements,
      resolvedPayloadAudits: payloadAudits(input.contextPackRefs)
    },
    resolvedContextPacks: input.resolvedContextPacks
  });
}

function productionBinding(contextPackRefs: readonly ContextPackRef[]) {
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
    evaluatedContextRequirements: evaluatedEvidenceTriageRequirements(contextPackRefs),
    resolvedPayloadAudits: payloadAudits(contextPackRefs)
  };
}

async function genericProductionShapedArtifact(runType: Parameters<typeof productionSpecialistPromptRegistrationFor>[0]) {
  const registration = productionSpecialistPromptRegistrationFor(runType);
  const resolvedContextPacks = await Promise.all(registration.contextRequirements
    .filter((requirement) => requirement.requirementMode === "always")
    .map((requirement) => contextPackRegistry.buildResolved(requirement.contextPackId)));
  const contextPackRefs = resolvedContextPacks.map((resolved) => resolved.ref);
  const evaluatedContextRequirements = registration.contextRequirements.map((requirement) => {
    const ref = contextPackRefs.find((contextPackRef) => contextPackRef.contextPackId === requirement.contextPackId);
    return ref === undefined
      ? {
        contextPackId: requirement.contextPackId,
        requirementMode: requirement.requirementMode,
        status: "not-applicable" as const,
        omissionReason: "no-associated-prr" as const
      }
      : {
        contextPackId: requirement.contextPackId,
        requirementMode: requirement.requirementMode,
        status: "applicable" as const,
        contentHash: ref.contentHash
      };
  });
  const text = [
    `Template: ${registration.promptTemplateId}@${registration.promptTemplateVersion}`,
    `Return only JSON conforming to ${registration.providerOutputSchemaId}@${registration.providerOutputSchemaVersion}.`,
    `Handoff schema: ${registration.handoffSchemaId}@${registration.handoffSchemaVersion}.`,
    "Verified payload context follows:",
    ...contextPackRefs.flatMap((ref) => [
      `Context pack ID: ${ref.contextPackId}`,
      `Content hash: ${ref.contentHash}`
    ])
  ].join("\n");

  return buildPromptArtifact({
    promptTemplateId: registration.promptTemplateId,
    promptTemplateVersion: registration.promptTemplateVersion,
    generatedAt: "2026-07-10T12:00:00.000Z",
    runType,
    safetyClass: "provider-approved",
    transferApprovalClass: "provider-byte-transfer",
    contextPackRefs,
    text,
    safeSummary: "Production-shaped generic prompt artifact.",
    omissions: evaluatedContextRequirements
      .filter((requirement) => requirement.status === "not-applicable")
      .map(() => ({ reason: "no-associated-prr", sourceRef: "prr-read-model.v1", safeSummary: "PRR context is not applicable." })),
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
      evaluatedContextRequirements,
      resolvedPayloadAudits: payloadAudits(contextPackRefs)
    },
    resolvedContextPacks
  });
}

function permissiveProductionShapedParser(contextPackId: string) {
  const parser = (payload: AgentContextPackJsonValue): AgentContextPackJsonValue => payload;
  Object.defineProperty(parser, "cestusContextPackParserId", {
    value: contextPackId,
    enumerable: false,
    writable: false,
    configurable: false
  });
  registerContextPackPayloadParserAuthority(parser);
  return parser;
}

function unsafeCredentialLikeText(): string {
  return ["Author", "ization", ": ", "Bear", "er", " ", "raw-provider-material"].join("");
}
