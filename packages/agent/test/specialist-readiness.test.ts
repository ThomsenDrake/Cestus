import { describe, expect, it } from "vitest";
import {
  buildContextPackRef,
  createContextPackRegistry,
  parseSpecialistWorkflowReadinessDto,
  projectSpecialistWorkflowReadiness,
  specialistWorkflowDescriptorFor,
  type ContextPackRef,
  type ProviderReadinessDto,
  type ProviderSetupCard,
  type SpecialistWorkflowDescriptor
} from "../src/index.js";
import { productionSpecialistPromptRegistrations } from "../src/production-specialist-prompts.js";
import { registerContextPackPayloadParserAuthority, type AgentContextPackJsonValue } from "../src/context-packs.js";

const generatedAt = "2026-07-09T12:00:00.000Z";
const currentProjectionHighWaterMarks = {
  "accepted-graph-projection.v1": 12,
  "agent-memory-summary.v1": 12,
  "contradiction-candidate-summary.v1": 12,
  "evidence-summary.v1": 12,
  "governance-locks.v1": 12,
  "jurisdiction-pack-summary.v1": 12,
  "prr-read-model.v1": 12,
  "task-run-history.v1": 12,
  "timeline-draft-summary.v1": 12,
  "workspace-runtime-status.v1": 12
} as const;

const readyProviderCard: ProviderSetupCard = {
  providerId: "provider_local_model",
  label: "Local model",
  backendKind: "local-engine",
  capabilitySummary: ["schema output", "text"],
  credentialKindSummary: ["local-no-secret"],
  state: "works-locally",
  requiredApprovalClass: "none",
  credentialHealth: "not-required",
  dataHandlingPosture: "local-only",
  safeActionIds: []
};

const byteTransferProviderCard: ProviderSetupCard = {
  providerId: "provider_remote_model",
  label: "Remote model",
  backendKind: "openai-compatible-api",
  capabilitySummary: ["schema output", "text"],
  credentialKindSummary: ["api-key-bearer"],
  state: "requires-byte-transfer-approval",
  requiredApprovalClass: "provider-byte-transfer",
  credentialHealth: "local-binding-healthy",
  dataHandlingPosture: "remote-prompt-byte-transfer-gated",
  credentialRefId: "agent_credref_remote_model",
  safeActionIds: ["action_request_provider_byte_transfer_approval"]
};

const blockedProviderCard: ProviderSetupCard = {
  ...readyProviderCard,
  state: "needs-api-key",
  credentialHealth: "local-binding-missing",
  safeActionIds: ["action_link_provider_credential"]
};

const readinessContextPackIds = [
  "accepted-graph-projection.v1",
  "evidence-summary.v1",
  "timeline-draft-summary.v1",
  "contradiction-candidate-summary.v1",
  "governance-locks.v1",
  "agent-memory-summary.v1",
  "task-run-history.v1",
  "workspace-runtime-status.v1",
  "prr-read-model.v1",
  "jurisdiction-pack-summary.v1"
] as const;

const readinessRegistry = createReadinessContextPackRegistry();
const readinessResolvedById = new Map(await Promise.all(readinessContextPackIds.map(async (contextPackId) => {
  const resolved = await readinessRegistry.buildResolved(contextPackId);
  return [contextPackId, resolved] as const;
})));

describe("specialist workflow readiness projection", () => {
  it("blocks the plan sample when timeline-builder is missing the domain adapter contract", () => {
    const descriptor = specialistWorkflowDescriptorFor("timeline-builder");

    expect(projectSpecialistWorkflowReadiness({
      runType: "timeline-builder",
      descriptor,
      availableContracts: ["agent.scheduler-resumer.v1"],
      scope: { kind: "investigation", refs: ["inv_001"] },
      contextPackRefs: [],
      resolvedContextPacks: [],
      productionPromptRegistrations: [],
      providerReadiness: providerReadinessDto([readyProviderCard]),
      availableDomainAdapterFamilies: ["provider-byte-transfer"],
      currentProjectionHighWaterMarks,
      activeLocks: [],
      satisfiedApprovalClasses: []
    })).toMatchObject({
      status: "blocked",
      category: "blocked-prerequisite",
      missingContractIds: ["agent.domain-adapter.v1"],
      residentAgentId: "agent_default",
      contextReady: false,
      executionReady: false
    });
  });

  it("blocks context readiness when required context pack refs are missing", () => {
    const descriptor = specialistWorkflowDescriptorFor("timeline-builder");
    const refs = refsFor(descriptor).filter((ref) => ref.contextPackId !== "evidence-summary.v1");

    const readiness = projectSpecialistWorkflowReadiness(readyInput(descriptor, {
      contextPackRefs: refs
    }));

    expect(readiness).toMatchObject({
      status: "blocked",
      category: "blocked-provenance",
      contextReady: false,
      executionReady: false,
      missingContextPackIds: ["evidence-summary.v1"]
    });
  });

  it("requires context refs to match descriptor IDs and current projection high-water marks before context-ready", () => {
    const descriptor = specialistWorkflowDescriptorFor("timeline-builder");
    const staleRefs = refsFor(descriptor, {
      "workspace-runtime-status.v1": 11
    });

    const stale = projectSpecialistWorkflowReadiness(readyInput(descriptor, {
      contextPackRefs: staleRefs
    }));

    expect(stale).toMatchObject({
      status: "blocked",
      category: "projection-lag",
      contextReady: false,
      staleContextPackIds: ["workspace-runtime-status.v1"]
    });

    const ready = projectSpecialistWorkflowReadiness(readyInput(descriptor));

    expect(ready).toMatchObject({
      status: "context-ready",
      category: "context-ready",
      contextReady: true,
      executionReady: false,
      staleContextPackIds: []
    });
  });

  it("blocks readiness when the descriptor prompt template is not registered", () => {
    const descriptor = specialistWorkflowDescriptorFor("timeline-builder");

    const readiness = projectSpecialistWorkflowReadiness(readyInput(descriptor, {
      productionPromptRegistrations: []
    }));

    expect(readiness).toMatchObject({
      status: "blocked",
      category: "blocked-prerequisite",
      missingPromptTemplateIds: ["timeline-builder.sourced-timeline.v1"],
      contextReady: false,
      executionReady: false
    });
  });

  it("treats absent PRR context as a bounded omission for non-PRR imported evidence readiness", () => {
    const descriptor = specialistWorkflowDescriptorFor("evidence-triage");
    const readiness = projectSpecialistWorkflowReadiness(readyInput(descriptor, {
      scope: { kind: "imported-evidence", refs: ["ev_imported_001"] },
      contextPackRefs: refsFor(descriptor).filter((ref) => ref.contextPackId !== "prr-read-model.v1"),
      resolvedContextPacks: resolvedRefsFor(descriptor),
      productionPromptRegistrations: productionSpecialistPromptRegistrations
    } as never));

    expect(readiness.contextReady).toBe(true);
    expect(readiness.missingContextPackIds).toEqual([]);
    expect(readiness.contextOmissions).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: "no-associated-prr", sourceRef: "prr-read-model.v1" })
    ]));
  });

  it("requires PRR context for PRR-linked runs but not for non-PRR evidence triage, planning, and report building", () => {
    for (const runType of ["evidence-triage", "investigation-planner", "report-builder"] as const) {
      const descriptor = specialistWorkflowDescriptorFor(runType);
      const withoutPrr = refsFor(descriptor).filter((ref) => ref.contextPackId !== "prr-read-model.v1");

      expect(projectSpecialistWorkflowReadiness(readyInput(descriptor, {
        scope: { kind: "imported-evidence", refs: ["ev_imported_001"] },
        contextPackRefs: withoutPrr,
        resolvedContextPacks: [] as never,
        productionPromptRegistrations: productionSpecialistPromptRegistrations
      } as never)).missingContextPackIds).toEqual([]);

      expect(projectSpecialistWorkflowReadiness(readyInput(descriptor, {
        scope: {
          kind: "prr-request",
          refs: ["prr_selected_001"],
          associatedPrrRequestId: "prr_selected_001"
        },
        contextPackRefs: withoutPrr,
        resolvedContextPacks: [] as never,
        productionPromptRegistrations: productionSpecialistPromptRegistrations
      } as never)).missingContextPackIds).toEqual(["prr-read-model.v1"]);
    }
  });

  it("blocks prompt readiness without authoritative resolved payloads or with thin test-only registrations", () => {
    const descriptor = specialistWorkflowDescriptorFor("timeline-builder");
    const withoutPayloads = projectSpecialistWorkflowReadiness(readyInput(descriptor, {
      scope: { kind: "investigation", refs: ["inv_001"] },
      resolvedContextPacks: [] as never,
      productionPromptRegistrations: productionSpecialistPromptRegistrations
    } as never));
    expect(withoutPayloads.contextReady).toBe(false);

    const thinRegistration = projectSpecialistWorkflowReadiness(readyInput(descriptor, {
      scope: { kind: "investigation", refs: ["inv_001"] },
      productionPromptRegistrations: [{
        runType: descriptor.runType,
        promptTemplateId: descriptor.promptTemplate.promptTemplateId,
        promptTemplateVersion: 1,
        production: false
      }] as never
    } as never));
    expect(thinRegistration.missingPromptTemplateIds).toEqual([descriptor.promptTemplate.promptTemplateId]);
  });

  it("blocks for missing or unready providers, but waits for provider byte-transfer approval when that is the only gap", () => {
    const descriptor = specialistWorkflowDescriptorFor("timeline-builder");

    const missingProvider = projectSpecialistWorkflowReadiness(readyInput(descriptor, {
      providerReadiness: providerReadinessDto([])
    }));

    expect(missingProvider).toMatchObject({
      status: "blocked",
      category: "blocked-prerequisite",
      contextReady: false,
      missingProviderStates: [{ providerId: "provider:missing", state: "provider-unavailable" }]
    });

    const unreadyProvider = projectSpecialistWorkflowReadiness(readyInput(descriptor, {
      providerReadiness: providerReadinessDto([blockedProviderCard])
    }));

    expect(unreadyProvider).toMatchObject({
      status: "blocked",
      category: "blocked-prerequisite",
      contextReady: false,
      missingProviderStates: [{ providerId: "provider_local_model", state: "needs-api-key" }]
    });

    const waiting = projectSpecialistWorkflowReadiness(readyInput(descriptor, {
      providerReadiness: providerReadinessDto([byteTransferProviderCard])
    }));

    expect(waiting).toMatchObject({
      status: "waiting-for-approval",
      category: "approval-required",
      missingApprovalClasses: ["provider-byte-transfer"],
      contextReady: false,
      executionReady: false
    });
  });

  it("rejects malformed direct provider readiness cards before claiming provider readiness", () => {
    const descriptor = specialistWorkflowDescriptorFor("timeline-builder");

    expect(() => projectSpecialistWorkflowReadiness(readyInput(descriptor, {
      providerReadiness: {
        cards: [{ state: "works-locally" }] as unknown as readonly ProviderSetupCard[]
      }
    }))).toThrow();
  });

  it("blocks when a required domain adapter family is missing", () => {
    const descriptor = specialistWorkflowDescriptorFor("prr-negotiation");

    const readiness = projectSpecialistWorkflowReadiness(readyInput(descriptor, {
      availableDomainAdapterFamilies: ["provider-byte-transfer"]
    }));

    expect(readiness).toMatchObject({
      status: "blocked",
      category: "blocked-prerequisite",
      contextReady: false,
      missingAdapterFamilies: ["prr-correspondence"]
    });
  });

  it("reports exact future contradiction claim review family without mapping it to accepted graph readiness", () => {
    const descriptor = specialistWorkflowDescriptorFor("contradiction-finder");

    const readiness = projectSpecialistWorkflowReadiness(readyInput(descriptor, {
      availableDomainAdapterFamilies: ["provider-byte-transfer"]
    }));

    expect(descriptor.allowedTools.map((tool) => tool.toolId)).toEqual(expect.arrayContaining([
      "diagnostic.investigative-signal.request",
      "claim.contradiction-link.request"
    ]));
    expect(readiness).toMatchObject({
      status: "blocked",
      category: "blocked-prerequisite",
      missingAdapterFamilies: ["contradiction-claim-review"]
    });
    expect(readiness.nextSafeActions).not.toContain("register domain adapter family accepted-graph-review");
    expect(readiness.nextSafeActions).toContain("register domain adapter family contradiction-claim-review");
  });

  it("blocks on active locks and reports only safe lock IDs", () => {
    const descriptor = specialistWorkflowDescriptorFor("timeline-builder");

    const readiness = projectSpecialistWorkflowReadiness(readyInput(descriptor, {
      activeLocks: [
        { lockId: "lock_provider_transfer_review", category: "provider-transfer", safeSummary: "Provider transfer review is active." }
      ]
    }));

    expect(readiness).toMatchObject({
      status: "blocked",
      category: "blocked-lock",
      activeLockIds: ["lock_provider_transfer_review"],
      contextReady: false,
      executionReady: false
    });
    expect(JSON.stringify(readiness)).not.toMatch(/Provider transfer review is active/);
  });

  it("reaches context-ready with execution disabled when every pure prerequisite is supplied", () => {
    const descriptor = specialistWorkflowDescriptorFor("timeline-builder");

    const readiness = projectSpecialistWorkflowReadiness(readyInput(descriptor));

    expect(readiness).toMatchObject({
      schemaVersion: "agent-specialist-workflow-readiness.v1",
      runType: "timeline-builder",
      residentAgentId: "agent_default",
      status: "context-ready",
      category: "context-ready",
      contextReady: true,
      executionReady: false,
      missingContractIds: [],
      missingContextPackIds: [],
      staleContextPackIds: [],
      missingPromptTemplateIds: [],
      missingProviderStates: [],
      missingAdapterFamilies: [],
      activeLockIds: [],
      missingApprovalClasses: []
    });
    expect(Object.isFrozen(readiness)).toBe(true);
    expect(Object.isFrozen(readiness.nextSafeActions)).toBe(true);
    expect(readiness.nextSafeActions).toContain("keep specialist execution disabled until a workflow runner is approved");
  });

  it("rejects unknown raw and secret fields in the public readiness DTO schema", () => {
    const descriptor = specialistWorkflowDescriptorFor("timeline-builder");
    const readiness = projectSpecialistWorkflowReadiness(readyInput(descriptor));

    expect(parseSpecialistWorkflowReadinessDto(readiness)).toEqual(readiness);
    for (const unsafe of [
      { rawProviderError: "stack with provider internals" },
      { authorization: "Bearer sk-live-review-token" },
      { credentials: "sk-live-review-token" },
      { rawText: "private prompt text" },
      { hiddenPath: "/home/drake/.config/oauth/token.json" },
      { command: "curl https://example.test --header Authorization:Bearer" }
    ]) {
      expect(() => parseSpecialistWorkflowReadinessDto({ ...readiness, ...unsafe })).toThrow();
    }
  });

  it("rejects unsupported run types in the public readiness DTO schema", () => {
    const descriptor = specialistWorkflowDescriptorFor("timeline-builder");
    const readiness = projectSpecialistWorkflowReadiness(readyInput(descriptor));

    expect(() => parseSpecialistWorkflowReadinessDto({
      ...readiness,
      runType: "legacy-bootstrap"
    })).toThrow();
    expect(() => parseSpecialistWorkflowReadinessDto({
      ...readiness,
      runType: "ontology-bootstrap"
    })).toThrow();
  });

  it.each([
    ["missingContractIds", { missingContractIds: ["agent.domain-adapter.v1"] }],
    ["missingContextPackIds", { missingContextPackIds: ["evidence-summary.v1"] }],
    ["staleContextPackIds", { staleContextPackIds: ["workspace-runtime-status.v1"] }],
    ["missingProjectionHighWaterMarkIds", { missingProjectionHighWaterMarkIds: ["workspace-runtime-status.v1"] }],
    ["missingProvenanceContextPackIds", { missingProvenanceContextPackIds: ["evidence-summary.v1"] }],
    ["missingPromptTemplateIds", { missingPromptTemplateIds: ["timeline-builder.sourced-timeline.v1"] }],
    [
      "missingProviderStates",
      {
        missingProviderStates: [{
          providerId: "provider_local_model",
          state: "needs-api-key",
          requiredApprovalClass: "none",
          safeActionIds: ["action_link_provider_credential"]
        }]
      }
    ],
    ["missingAdapterFamilies", { missingAdapterFamilies: ["provider-byte-transfer"] }],
    ["activeLockIds", { activeLockIds: ["lock_provider_transfer_review"] }],
    ["missingApprovalClasses", { missingApprovalClasses: ["provider-byte-transfer"] }]
  ] as const)("rejects forged context-ready DTOs with non-empty %s", (_label, patch) => {
    expect(() => parseSpecialistWorkflowReadinessDto({
      ...validReadyDto(),
      ...patch
    })).toThrow();
  });

  it("rejects status and contextReady combinations that disagree", () => {
    expect(() => parseSpecialistWorkflowReadinessDto({
      ...validReadyDto(),
      status: "blocked",
      category: "blocked-prerequisite",
      contextReady: true,
      missingContractIds: ["agent.domain-adapter.v1"]
    })).toThrow();
    expect(() => parseSpecialistWorkflowReadinessDto({
      ...validReadyDto(),
      status: "waiting-for-approval",
      category: "approval-required",
      contextReady: true,
      missingApprovalClasses: ["provider-byte-transfer"]
    })).toThrow();
    expect(() => parseSpecialistWorkflowReadinessDto({
      ...validReadyDto(),
      status: "context-ready",
      category: "context-ready",
      contextReady: false
    })).toThrow();
  });

  it("rejects waiting-for-approval without an approval blocker and mismatched blocker categories", () => {
    expect(() => parseSpecialistWorkflowReadinessDto({
      ...validReadyDto(),
      status: "waiting-for-approval",
      category: "approval-required",
      contextReady: false,
      missingApprovalClasses: []
    })).toThrow();
    expect(() => parseSpecialistWorkflowReadinessDto({
      ...validReadyDto(),
      status: "blocked",
      category: "blocked-lock",
      contextReady: false,
      missingPromptTemplateIds: ["timeline-builder.sourced-timeline.v1"]
    })).toThrow();
    expect(() => parseSpecialistWorkflowReadinessDto({
      ...validReadyDto(),
      status: "blocked",
      category: "blocked-prerequisite",
      contextReady: false,
      staleContextPackIds: ["workspace-runtime-status.v1"]
    })).toThrow();
  });

  it("rejects command-shaped text inside allowed public action fields", () => {
    expect(() => parseSpecialistWorkflowReadinessDto({
      ...validReadyDto(),
      nextSafeActions: ["npm run verify"]
    })).toThrow();
    expect(() => parseSpecialistWorkflowReadinessDto({
      ...validReadyDto(),
      status: "blocked",
      category: "blocked-prerequisite",
      contextReady: false,
      missingProviderStates: [{
        providerId: "provider_local_model",
        state: "needs-api-key",
        requiredApprovalClass: "none",
        safeActionIds: ["curl https://example.test --header Authorization:Bearer"]
      }]
    })).toThrow();
  });
});

function readyInput(
  descriptor: SpecialistWorkflowDescriptor,
  patch: Partial<Parameters<typeof projectSpecialistWorkflowReadiness>[0]> = {}
): Parameters<typeof projectSpecialistWorkflowReadiness>[0] {
  return {
    runType: descriptor.runType,
    descriptor,
    availableContracts: [...descriptor.prerequisiteContractIds],
    scope: { kind: "investigation", refs: ["inv_001"] },
    contextPackRefs: refsFor(descriptor),
    resolvedContextPacks: resolvedRefsFor(descriptor),
    productionPromptRegistrations: productionSpecialistPromptRegistrations,
    providerReadiness: providerReadinessDto([readyProviderCard]),
    availableDomainAdapterFamilies: ["provider-byte-transfer", "prr-correspondence"],
    currentProjectionHighWaterMarks,
    activeLocks: [],
    satisfiedApprovalClasses: [],
    ...patch
  };
}

function refsFor(
  descriptor: SpecialistWorkflowDescriptor,
  watermarks: Partial<Record<string, number>> = {}
): readonly ContextPackRef[] {
  return descriptor.contextPacks.map((pack) => contextRef(pack.contextPackId, watermarks[pack.contextPackId] ?? 12));
}

function contextRef(contextPackId: string, projectionHighWaterMark: number): ContextPackRef {
  return buildContextPackRef({
    contextPackId,
    version: Number(contextPackId.match(/\.v([0-9]+)$/)?.[1] ?? 1),
    generatedAt,
    payload: { contextPackId, projectionHighWaterMark },
    safeSummary: `Safe summary for ${contextPackId}.`,
    provenanceRefs: ["evt_context_source"],
    projectionHighWaterMark,
    sourceEventIds: ["evt_context_source"]
  });
}

function resolvedRefsFor(descriptor: SpecialistWorkflowDescriptor) {
  return descriptor.contextPacks
    .filter((pack) => pack.requirementMode === "always")
    .map((pack) => {
      const resolved = readinessResolvedById.get(pack.contextPackId as typeof readinessContextPackIds[number]);
      if (resolved === undefined) throw new Error(`Missing readiness context fixture for ${pack.contextPackId}`);
      return resolved;
    });
}

function createReadinessContextPackRegistry() {
  const registry = createContextPackRegistry();
  for (const contextPackId of readinessContextPackIds) {
    const parser = (payload: AgentContextPackJsonValue) => payload;
    Object.defineProperty(parser, "cestusContextPackParserId", {
      value: readinessParserIdentity(contextPackId), enumerable: false, writable: false, configurable: false
    });
    registerContextPackPayloadParserAuthority(parser);
    registry.register({
      descriptor: {
        contextPackId,
        version: 1,
        label: `Readiness ${contextPackId}`,
        maxBytes: 16_384,
        requiredProvenanceKinds: ["event-id"],
        redactionPolicy: "safe-summary",
        sourceProjection: "agent.projection"
      },
      parsePayload: parser,
      build: () => ({
        contextPackId,
        version: 1,
        generatedAt,
        payload: { contextPackId, projectionHighWaterMark: 12 },
        safeSummary: `Safe summary for ${contextPackId}.`,
        provenanceRefs: ["evt_context_source"],
        projectionHighWaterMark: 12,
        sourceEventIds: ["evt_context_source"]
      })
    });
  }
  return registry;
}

function readinessParserIdentity(contextPackId: typeof readinessContextPackIds[number]): string {
  if (contextPackId === "timeline-draft-summary.v1") return "timeline-draft-summary.production-test-parser.v1";
  if (contextPackId === "contradiction-candidate-summary.v1") return "contradiction-candidate-summary.production-test-parser.v1";
  return contextPackId;
}

function providerReadinessDto(cards: readonly ProviderSetupCard[]): ProviderReadinessDto {
  return {
    schemaVersion: "agent-provider-readiness.v1",
    generatedAt,
    cards: [...cards],
    diagnostics: []
  };
}

function validReadyDto(): ReturnType<typeof projectSpecialistWorkflowReadiness> {
  return projectSpecialistWorkflowReadiness(readyInput(specialistWorkflowDescriptorFor("timeline-builder")));
}
