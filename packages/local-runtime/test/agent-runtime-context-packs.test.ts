import { describe, expect, it, vi } from "vitest";
import {
  createContextPackRegistry,
  lookupInvestigativeContextPackRegistrarEvidence,
  lookupOperationalContextPackRegistrarEvidence,
  lookupPrrContextPackRegistrarEvidence,
  registerInvestigativeContextPacks,
  registerOperationalContextPackBuilders,
  registerPrrContextPackBuilders,
  type ContextPackRegistry,
  type OperationalContextPackProvider,
  type PrrContextPackRegistrationEntry,
  type RegisterInvestigativeContextPacksInput
} from "../../agent/src/index.js";
import {
  buildJurisdictionPackSummaryContextPack,
  buildPrrReadModelContextPack,
  jurisdictionPackSummaryPayloadParser,
  prrReadModelPayloadParser
} from "../../agent/src/prr-context-packs.js";
import {
  buildSelectionManifestHash,
  investigativeRegistrationIdentity,
  type InvestigativeContextPackDependencies,
  type InvestigativeEvidenceRow,
  type InvestigativeSelectionManifestBody
} from "../../agent/src/investigative-context-packs.js";
import * as factorySurface from "../src/agent-runtime-factory.js";
import * as contextSurface from "../src/agent-runtime-context-packs.js";

const now = "2026-07-15T02:20:00.000Z";
const workspaceId = "workspace_a";
const policyVersion = "policy.v1";
type BuildSpy = ReturnType<typeof vi.fn> & (() => void);
type Family = "operational" | "prr" | "investigative";

describe("package-owned context registrar evidence", () => {
  it("exposes no public capture, consume, constructor, wrapper, or mint route", () => {
    const forbiddenContextExports = [
      "captureFactoryContextPackAttestation",
      "createFactoryHeldMountedAgentContextCapability",
      "createMountedAgentContextCapability"
    ];
    const forbiddenFactoryExports = [
      "createFactoryAttestedRuntimeCapabilities"
    ];

    for (const name of forbiddenContextExports) {
      expect(Reflect.get(contextSurface, name), `${name} must not be public`).toBeUndefined();
    }
    for (const name of forbiddenFactoryExports) {
      expect(Reflect.get(factorySurface, name), `${name} must not be public`).toBeUndefined();
    }
  });

  it.each([
    ["operational", "workspace-runtime-status.v1"],
    ["prr", "prr-read-model.v1"],
    ["investigative", "evidence-summary.v1"]
  ] as const)("returns immutable evidence and permits ordinary buildResolved for a real %s registration", async (family, contextPackId) => {
    const fixture = registerFamily(family);
    const evidence = registrarEvidence(fixture.registry, contextPackId);

    expect(evidence).toMatchObject({
      producerIdentity: `packages/agent/src/${family === "operational" ? "operational" : family}-context-packs`
    });
    expect(Object.isFrozen(evidence)).toBe(true);

    const resolved = await fixture.registry.buildResolved(contextPackId);
    expect(fixture.build).toHaveBeenCalledTimes(1);
    expect(resolved.ref.contextPackId).toBe(contextPackId);

    if (family === "operational") {
      expect(resolved.ref.scope).toEqual({ kind: "workspace", id: workspaceId });
      expect((resolved.payload as Record<string, unknown>).selectionManifest).toBeUndefined();
    }
    if (family === "prr") {
      expect(resolved.ref.scope).toEqual({ kind: "prr-request", id: "prr_req_selected" });
    }
    if (family === "investigative") {
      const manifest = (resolved.payload as { readonly selectionManifest: {
        readonly sourceProjectionHighWaterMarks: Readonly<Record<string, number>>;
      } }).selectionManifest;
      expect(manifest.sourceProjectionHighWaterMarks).toMatchObject({ ingestion: 42, graph: 41 });
      expect(Object.keys(manifest.sourceProjectionHighWaterMarks)).toHaveLength(2);
    }
  });

  it("returns no package-owned evidence for a foreign manual registry while ordinary buildResolved stays public", async () => {
    const registry = createContextPackRegistry();
    const build = vi.fn(async () => ({
      contextPackId: "foreign-context.v1",
      version: 1,
      generatedAt: now,
      payload: { ok: true },
      safeSummary: "Foreign public context pack.",
      provenanceRefs: ["evt_foreign"],
      stalenessInputs: []
    }));
    registry.register({
      descriptor: {
        contextPackId: "foreign-context.v1",
        version: 1,
        label: "Foreign context",
        maxBytes: 16_384,
        requiredProvenanceKinds: ["event-id"],
        redactionPolicy: "safe-summary",
        sourceProjection: "foreign.manual"
      },
      parsePayload: (payload) => payload,
      build
    });

    expect(lookupPrrContextPackRegistrarEvidence(registry, "foreign-context.v1")).toBeUndefined();
    expect(lookupOperationalContextPackRegistrarEvidence(registry, "foreign-context.v1")).toBeUndefined();
    expect(lookupInvestigativeContextPackRegistrarEvidence(registry, "foreign-context.v1")).toBeUndefined();
    await expect(registry.buildResolved("foreign-context.v1")).resolves.toMatchObject({
      ref: { contextPackId: "foreign-context.v1" }
    });
    expect(build).toHaveBeenCalledTimes(1);
  });
});

function registerFamily(family: Family): {
  readonly registry: ContextPackRegistry;
  readonly build: BuildSpy;
} {
  const registry = createContextPackRegistry();
  const build = vi.fn() as BuildSpy;
  if (family === "operational") {
    registerOperationalContextPackBuilders(registry, operationalProvider(build));
  } else if (family === "prr") {
    registerPrrContextPackBuilders({
      registry,
      prrReadModel: prrRegistration(build),
      jurisdictionPackSummary: jurisdictionRegistration()
    });
  } else {
    registerInvestigativeContextPacks(registry, investigativeRegistration(build));
  }
  return Object.freeze({ registry, build });
}

function registrarEvidence(registry: ContextPackRegistry, contextPackId: string) {
  const candidates = [
    lookupPrrContextPackRegistrarEvidence(registry, contextPackId),
    lookupOperationalContextPackRegistrarEvidence(registry, contextPackId),
    lookupInvestigativeContextPackRegistrarEvidence(registry, contextPackId)
  ].filter((candidate) => candidate !== undefined);
  if (candidates.length !== 1) {
    throw new Error("test fixture requires exactly one package-owned registrar record");
  }
  return candidates[0]!;
}

function operationalProvider(build: BuildSpy): OperationalContextPackProvider {
  return {
    providerId: "runtime_context_test_provider",
    capabilities: ["workspace-runtime-status", "task-run-history", "agent-memory-summary"],
    policyVersion,
    generatedAt: now,
    scope: { kind: "workspace", id: workspaceId },
    sizeBudgets: { workspaceRuntimeStatus: 16_384, taskRunHistory: 32_768, agentMemorySummary: 16_384 },
    async workspaceRuntimeStatus() {
      build();
      return {
        runtimeHighWaterMark: 42,
        workspaceMounted: true,
        workspaceId,
        storageStrategy: "repo-local",
        bindPosture: "loopback",
        authPosture: "local-disabled",
        providerStates: [], diagnostics: [], projectionHighWaterMarks: { agent: 42 }, omissionCodes: []
      };
    },
    async taskRunHistorySnapshot() {
      return emptyHistory("agent.projection.task-run-history", "updatedAt:desc");
    },
    async agentMemorySnapshot() {
      return {
        projectionHighWaterMark: 42,
        projectionSourceRef: "agent.projection.memory",
        activeMemory: [], aggregateCounts: { active: 0, totalCount: 0 }, sourceEventIds: [], artifactHashes: [],
        window: { order: "createdAt:asc", limit: 25, hasMore: false, totalCount: 0, omissionCodes: [] },
        emptyProof: {
          projectionName: "agent.projection.memory", scope: { kind: "workspace", id: workspaceId },
          projectionHighWaterMark: 42, sourceEventCount: 0, generatedAt: now, emptyReasonCode: "empty"
        }
      };
    }
  };
}

function emptyHistory(projectionName: string, order: "updatedAt:desc") {
  return {
    projectionHighWaterMark: 42,
    projectionSourceRef: projectionName,
    tasks: [], runs: [], modelInvocations: [], toolRequests: [], aggregateCounts: { total: 0 }, sourceEventIds: [], artifactHashes: [],
    window: { order, limit: 25, hasMore: false, totalCount: 0, omissionCodes: [] },
    emptyProof: {
      projectionName, scope: { kind: "workspace", id: workspaceId }, projectionHighWaterMark: 42,
      sourceEventCount: 0, generatedAt: now, emptyReasonCode: "empty"
    }
  };
}

function prrRegistration(build: BuildSpy): PrrContextPackRegistrationEntry {
  const descriptor = Object.freeze({
    contextPackId: "prr-read-model.v1", version: 1, label: "Selected request PRR read model", maxBytes: 32_768,
    requiredProvenanceKinds: ["event-id", "content-hash"], redactionPolicy: "safe-normalized-summary",
    sourceProjection: "prr.projection.selected-request"
  });
  return Object.freeze({
    descriptor,
    payloadParser: prrReadModelPayloadParser,
    registrationIdentity: "packages/agent/prr-context-packs:prr-read-model.v1@1",
    builder: Object.freeze({ descriptor, build: () => {
      build();
      return buildSelectedPrrPack();
    } })
  });
}

function jurisdictionRegistration(): PrrContextPackRegistrationEntry {
  const descriptor = Object.freeze({
    contextPackId: "jurisdiction-pack-summary.v1", version: 1, label: "Selected request jurisdiction pack summary", maxBytes: 16_384,
    requiredProvenanceKinds: ["event-id", "content-hash"], redactionPolicy: "safe-normalized-summary",
    sourceProjection: "prr.jurisdiction-pack.selected-request"
  });
  return Object.freeze({
    descriptor,
    payloadParser: jurisdictionPackSummaryPayloadParser,
    registrationIdentity: "packages/agent/prr-context-packs:jurisdiction-pack-summary.v1@1",
    builder: Object.freeze({
      descriptor,
      build: () => buildJurisdictionPackSummaryContextPack({
        generatedAt: now, policyVersion, scope: { kind: "prr-request", id: "prr_req_selected" },
        selectedRequestEventId: "evt_prr_selected_created", selectedRequestJurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
        jurisdictionPack: {
          name: "us-federal-foia", version: "0.1.0", jurisdiction: "US Federal", description: "Federal FOIA starter jurisdiction pack.",
          agentGuidance: "Use cited rules as advisory workflow guidance.", rules: [{
            id: "federal-determination-20-working-days", label: "20 working days determination estimate", kind: "deadline",
            description: "Federal timing guidance.", citations: [{ label: "5 U.S.C. 552(a)(6)(A)(i)", citation: "5 U.S.C. 552(a)(6)(A)(i)", url: "https://www.justice.gov/oip/freedom-information-act-5-usc-552" }],
            agentWarning: "Confirm tolling facts before legal escalation language."
          }]
        },
        jurisdictionArtifactHash: `sha256:${"a".repeat(64)}`, projectionHighWaterMark: 77, sizeBudgetBytes: 16_384
      })
    })
  });
}

function buildSelectedPrrPack() {
  const bodyHash = `sha256:${"b".repeat(64)}` as const;
  const evidenceHash = `sha256:${"c".repeat(64)}` as const;
  return buildPrrReadModelContextPack({
    generatedAt: now, policyVersion, scope: { kind: "prr-request", id: "prr_req_selected" },
    request: {
      prrRequestId: "prr_req_selected", status: "sent", agencyName: "Selected Agency", jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
      agency: { name: "Selected Agency", email: "foia@example.gov" }, requester: { name: "Investigator", email: "investigator@example.org" },
      requestText: "Safe request summary.", latestOutboundCorrespondence: {
        correspondenceId: "corr_selected", provider: "gmail", providerMessageId: "msg_selected", subject: "Selected PRR follow-up", occurredAt: now,
        bodyHash, evidenceIds: ["ev_selected"], attachmentEvidenceIds: ["ev_selected"], approvedBy: "actor_investigator"
      },
      productionBatches: [], productionEvidenceIds: [], exemptions: [], possibleStalling: false, confirmedStalling: false, stallingSignals: []
    },
    timeline: [{ eventId: "evt_prr_selected_created", type: "prr.request.created", occurredAt: now, payload: { prrRequestId: "prr_req_selected" } as never }],
    requestStream: { requestCreatedEventId: "evt_prr_selected_created", streamHeadEventId: "evt_prr_selected_created", streamHighWaterMark: 9, sourceEventIds: ["evt_prr_selected_created"] },
    projectionHighWaterMark: 77, workspace: { totalPrrRequestCount: 1 },
    correspondenceHashes: [{ id: "corr_selected_body", contentHash: bodyHash, sourceEventId: "evt_prr_selected_created" }],
    evidenceHashes: [{ id: "ev_selected", contentHash: evidenceHash, sourceEventId: "evt_prr_selected_created" }], gates: [], sizeBudgetBytes: 32_768
  });
}

function investigativeRegistration(build: BuildSpy): RegisterInvestigativeContextPacksInput {
  const contentHash = `sha256:${"d".repeat(64)}` as const;
  const body: InvestigativeSelectionManifestBody = {
    manifestVersion: "investigative-selection-manifest.v1", scope: { kind: "workspace", id: workspaceId }, sourceProjectionHighWaterMarks: { ingestion: 42, graph: 41 },
    ordering: "ref-kind-ref-id-content-hash-v1", window: { cursor: "cursor_001", offset: 0, limit: 1, stableSort: "ref-kind-ref-id-content-hash-v1" },
    totalEligibleCount: 1, includedRefs: [{ refKind: "evidence", refId: "ev_context_001", sortKey: `evidence/ev_context_001/${contentHash}`, contentHash, sourceEventIds: ["evt_evidence_ingested_001"], mandatory: true }], aggregateOmissions: []
  };
  const manifest = Object.freeze({ ...body, manifestHash: buildSelectionManifestHash(body) });
  const evidence: InvestigativeEvidenceRow = { evidenceId: "ev_context_001", ingestionEventId: "evt_evidence_ingested_001", contentHash, occurrenceIds: [], parseJobs: [], governanceTags: [] };
  const deps: InvestigativeContextPackDependencies = {
    selection: { capabilityVersion: "investigative-selection.v1", select: async () => manifest },
    evidenceReader: { readEvidenceByIds: async () => { build(); return [evidence]; } },
    graphReader: { readAcceptedGraphByIds: async () => ({ assertions: [], entities: [], relationships: [], relationshipProjectionAvailable: true }) },
    governanceReader: { readActiveRestrictionsByIds: async () => [] }, agentLockReader: { readActiveLocksByIds: async () => [] }, eventReader: { readEventsByIds: async () => [] },
    evidenceSourcePosture: { postureVersion: "ingestion-current-source-posture.v1", checkEvidence: async () => ({ ok: true as const, stalenessInputs: [{ kind: "source-byte-current-hash", ref: evidence.evidenceId, value: evidence.contentHash }] }) },
    now: () => now, policyVersion, ontologyCoreVersion: "ontology.v1", packVersions: { ingestion: "ingestion.v1" }, registrationIdentity: investigativeRegistrationIdentity
  };
  return { deps, scope: { kind: "workspace", id: workspaceId }, window: body.window };
}
