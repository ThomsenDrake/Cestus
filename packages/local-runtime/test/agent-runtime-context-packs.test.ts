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
  buildEvidenceSummaryContextPack,
  buildSelectionManifestHash,
  investigativeRegistrationIdentity,
  type InvestigativeContextPackDependencies,
  type InvestigativeEvidenceRow,
  type InvestigativeSelectionManifestBody
} from "../../agent/src/investigative-context-packs.js";
import {
  createFactoryAttestedRuntimeCapabilities,
  type FactoryAttestedRuntimeCapabilities
} from "../src/agent-runtime-factory.js";
import {
  hasVerifiedContextBindingSet,
  type ContextRegistrationBinding,
  type MountedContextCapability,
  type MountedWorkspaceRuntimeAuthority,
  type RuntimeAuthorityReverificationInput
} from "../src/agent-runtime-context-packs.js";

const now = "2026-07-15T02:20:00.000Z";
const workspaceId = "workspace_a";
const mountInstanceId = "mount_a";
const workspaceIdentityEventId = "evt_workspace_identity_a";
const policyVersion = "policy.v1";
const authorityHighWaterMark = 100;
const zeroHash = `sha256:${"0".repeat(64)}`;
type BuildSpy = ReturnType<typeof vi.fn> & (() => void);

type Family = "operational" | "prr" | "investigative";

interface RegisteredFamilyFixture {
  readonly family: Family;
  readonly contextPackId: string;
  readonly factory: FactoryAttestedRuntimeCapabilities;
  readonly registrations: readonly ContextRegistrationBinding[];
  readonly capability: MountedContextCapability;
  readonly build: BuildSpy;
}

describe("mounted runtime context packs", () => {
  it.each([
    ["operational", "workspace-runtime-status.v1"],
    ["prr", "prr-read-model.v1"],
    ["investigative", "evidence-summary.v1"]
  ] as const)("accepts real %s registrar evidence without treating source projection as producer identity", async (family, contextPackId) => {
    const fixture = await registeredFamilyFixture(family);
    fixture.build.mockClear();

    const bindingSet = await fixture.capability.verifyForRun(verifyForRun({
      requiredContextPackIds: [contextPackId]
    }));

    expect(bindingSet.contextPacks.map((pack) => pack.ref.contextPackId)).toEqual([contextPackId]);
    expect(bindingSet.bindings).toHaveLength(1);
    expect(bindingSet.bindings[0]?.producerIdentity).toMatch(/^packages\/agent\/src\//);
    expect(bindingSet.bindings[0]?.producerIdentity).not.toBe(bindingSet.bindings[0]?.sourceProjection);
    expect(bindingSet.bindings[0]?.registrationIdentity).not.toBe(bindingSet.bindings[0]?.producerIdentity);
    expect(fixture.build).toHaveBeenCalledTimes(1);
    expect(hasVerifiedContextBindingSet(bindingSet)).toBe(true);
    expect(hasVerifiedContextBindingSet({ ...bindingSet })).toBe(false);
  });

  it("builds once only after current mounted authority and run binding revalidate", async () => {
    const fixture = await registeredFamilyFixture("operational");
    fixture.build.mockClear();

    const bindingSet = await fixture.capability.verifyForRun(verifyForRun());

    expect(fixture.build).toHaveBeenCalledTimes(1);
    expect(bindingSet).toMatchObject({
      schemaVersion: "verified-context-binding-set.v1",
      workspaceId,
      mountInstanceId,
      workspaceIdentityEventId,
      policyVersion,
      runId: "run_context_a",
      sourceHighWaterMark: authorityHighWaterMark,
      bindings: [{ contextPackId: "workspace-runtime-status.v1" }]
    });
    expect(Object.isFrozen(bindingSet)).toBe(true);
    expect(Object.isFrozen(bindingSet.bindings)).toBe(true);
  });

  it("stops before any builder for a switched mount or stale authority", async () => {
    const switched = await registeredFamilyFixture("operational");
    switched.build.mockClear();
    await expect(switched.capability.verifyForRun(verifyForRun({ mountInstanceId: "mount_b" })))
      .rejects.toThrow("blocked.workspace-identity-mismatch");
    expect(switched.build).not.toHaveBeenCalled();

    const stale = await registeredFamilyFixture("operational", {
      authorityResult: Object.freeze({
        schemaVersion: "mounted-runtime-authority-reverification.v1" as const,
        ok: false as const,
        category: "stale-authority"
      })
    });
    stale.build.mockClear();
    await expect(stale.capability.verifyForRun(verifyForRun()))
      .rejects.toThrow("blocked.mounted-authority-unavailable");
    expect(stale.build).not.toHaveBeenCalled();
  });

  it.each([
    ["producerIdentity", "forged-producer.v1"],
    ["registrationIdentity", "forged-registration.v1"],
    ["parserIdentity", "forged-parser.v1"]
  ] as const)("rejects a swapped %s before the registered builder runs", async (field, value) => {
    const fixture = await registeredFamilyFixture("operational");
    fixture.build.mockClear();
    const registrations = fixture.registrations.map((registration) =>
      registration.contextPackId === fixture.contextPackId
        ? Object.freeze({ ...registration, [field]: value })
        : registration
    );

    expect(() => fixture.factory.createMountedContextCapability({
      authority: mountedAuthority(),
      registrations
    })).toThrow("blocked.factory-context-attestation-required");
    expect(fixture.build).not.toHaveBeenCalled();
  });

  it("rejects duplicate mounted or requested packs before a second build", async () => {
    const fixture = await registeredFamilyFixture("operational");
    fixture.build.mockClear();
    const duplicate = fixture.registrations[0]!;

    expect(() => fixture.factory.createMountedContextCapability({
      authority: mountedAuthority(),
      registrations: [...fixture.registrations, duplicate]
    })).toThrow("blocked.duplicate-context-pack-registration");

    await expect(fixture.capability.verifyForRun(verifyForRun({
      requiredContextPackIds: [fixture.contextPackId, fixture.contextPackId]
    }))).rejects.toThrow("blocked.duplicate-context-pack-requirement");
    expect(fixture.build).not.toHaveBeenCalled();
  });

  it("normalizes hostile run inputs before any registered builder activity", async () => {
    const fixture = await registeredFamilyFixture("operational");
    fixture.build.mockClear();
    let getterInvoked = false;
    const accessorRequest = verifyForRun() as Record<string, unknown>;
    Object.defineProperty(accessorRequest, "workspaceId", {
      enumerable: true,
      get() {
        getterInvoked = true;
        return workspaceId;
      }
    });
    const sparse = [fixture.contextPackId] as string[];
    sparse.length = 2;
    const customArray = [fixture.contextPackId] as string[];
    Object.setPrototypeOf(customArray, Object.create(Array.prototype));
    const symbolRequest = verifyForRun() as Record<PropertyKey, unknown>;
    symbolRequest[Symbol("forbidden")] = true;
    const customObject = Object.assign(Object.create({}), verifyForRun());

    for (const request of [
      accessorRequest,
      verifyForRun({ requiredContextPackIds: sparse }),
      verifyForRun({ requiredContextPackIds: customArray }),
      symbolRequest,
      customObject
    ]) {
      await expect(fixture.capability.verifyForRun(request as never))
        .rejects.toThrow("blocked.invalid-verify-mounted-context-for-run");
    }
    expect(getterInvoked).toBe(false);
    expect(fixture.build).not.toHaveBeenCalled();
  });

  it("fails closed when default composition has no package-owned registrar evidence", () => {
    const factory = createFactoryAttestedRuntimeCapabilities();
    expect(() => factory.createMountedContextCapability({
      authority: mountedAuthority(),
      registrations: [structuralRegistration("workspace-runtime-status.v1")]
    })).toThrow("blocked.factory-context-attestation-required");
  });
});

async function registeredFamilyFixture(
  family: Family,
  options: {
    readonly authorityResult?: unknown;
  } = {}
): Promise<RegisteredFamilyFixture> {
  const registry = createContextPackRegistry();
  const build = vi.fn() as BuildSpy;
  const contextPackId = registerFamily(registry, family, build);
  const factory = createFactoryAttestedRuntimeCapabilities({ contextRegistry: registry });
  const resolved = await registry.buildResolved(contextPackId);
  const registrations = registry.listDescriptors().map((descriptor) =>
    structuralRegistration(descriptor.contextPackId, descriptor.contextPackId === contextPackId ? resolved : undefined, registry)
  );
  const capability = factory.createMountedContextCapability({
    authority: mountedAuthority({ result: options.authorityResult }),
    registrations
  });
  return Object.freeze({ family, contextPackId, factory, registrations, capability, build });
}

function registerFamily(registry: ContextPackRegistry, family: Family, build: BuildSpy): string {
  if (family === "operational") {
    registerOperationalContextPackBuilders(registry, operationalProvider(build));
    return "workspace-runtime-status.v1";
  }
  if (family === "prr") {
    registerPrrContextPackBuilders({
      registry,
      prrReadModel: prrRegistration(build),
      jurisdictionPackSummary: jurisdictionRegistration()
    });
    return "prr-read-model.v1";
  }
  registerInvestigativeContextPacks(registry, investigativeRegistration(build));
  return "evidence-summary.v1";
}

function structuralRegistration(
  contextPackId: string,
  resolved?: {
    readonly ref: {
      readonly scope?: { readonly kind: string; readonly id: string };
      readonly projectionHighWaterMark?: number;
      readonly contentHash: string;
      readonly sizeBytes: number;
      readonly policyVersion?: string;
      readonly provenanceRefs: readonly string[];
    };
    readonly payload: unknown;
  },
  registry?: ContextPackRegistry
): ContextRegistrationBinding {
  const descriptor = registry?.getDescriptor(contextPackId);
  const evidence = registry === undefined ? undefined : registrarEvidence(registry, contextPackId);
  const scope = resolved?.ref.scope ?? (contextPackId.startsWith("prr-") || contextPackId === "jurisdiction-pack-summary.v1"
    ? { kind: "prr-request", id: "prr_req_selected" }
    : { kind: "workspace", id: workspaceId });
  return Object.freeze({
    schemaVersion: "context-registration-binding.v1",
    workspaceId,
    contextPackId,
    version: descriptor?.version ?? 1,
    descriptorHash: evidence?.descriptorHash ?? zeroHash,
    parserIdentity: evidence?.parserIdentity ?? contextPackId,
    producerIdentity: evidence?.producerIdentity ?? "packages/agent/src/operational-context-packs",
    registrationIdentity: evidence?.registrationIdentity ?? "structural-registration",
    sourceProjection: descriptor?.sourceProjection ?? "runtime.workspace-status",
    scope,
    sourceHighWaterMark: resolved?.ref.projectionHighWaterMark ?? 0,
    selectionProof: selectionProof(contextPackId, resolved?.payload),
    contentHash: resolved?.ref.contentHash ?? zeroHash,
    sizeBytes: resolved?.ref.sizeBytes ?? 1,
    policyVersion: resolved?.ref.policyVersion ?? policyVersion,
    provenanceRefs: resolved?.ref.provenanceRefs ?? ["evt_context_fixture"]
  });
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

function selectionProof(contextPackId: string, payload?: unknown): ContextRegistrationBinding["selectionProof"] {
  if (contextPackId === "prr-read-model.v1") {
    return { kind: "prr-selected-request.v1", streamHighWaterMark: 9 };
  }
  if (contextPackId === "jurisdiction-pack-summary.v1") {
    return { kind: "prr-jurisdiction.v1", selectedRequestEventId: "evt_prr_selected_created" };
  }
  if (contextPackId.startsWith("accepted-") || contextPackId === "evidence-summary.v1" || contextPackId === "governance-locks.v1") {
    const selectionManifest = payload as {
      readonly selectionManifest?: {
        readonly manifestHash?: string;
        readonly sourceProjectionHighWaterMarks?: Readonly<Record<"agent" | "governance" | "graph" | "ingestion", number>>;
      };
    } | undefined;
    const marks = selectionManifest?.selectionManifest?.sourceProjectionHighWaterMarks;
    return {
      kind: "investigative-selection-manifest.v1",
      manifestHash: selectionManifest?.selectionManifest?.manifestHash ?? zeroHash,
      sourceProjectionHighWaterMarks: marks === undefined
        ? [{ projection: "ingestion", highWaterMark: 0 }]
        : (Object.entries(marks).map(([projection, highWaterMark]) => ({
            projection: projection as "agent" | "governance" | "graph" | "ingestion",
            highWaterMark
          })).sort((left, right) => left.projection.localeCompare(right.projection)))
    };
  }
  return { kind: "operational-ref.v1" };
}

function mountedAuthority(options: {
  readonly result?: unknown;
} = {}): MountedWorkspaceRuntimeAuthority {
  return Object.freeze({
    authorityVersion: "mounted-workspace-runtime-authority.v1" as const,
    workspaceId,
    mountInstanceId,
    workspaceIdentityEventId,
    policyVersion,
    sourceHighWaterMark: authorityHighWaterMark,
    async reverify(input: RuntimeAuthorityReverificationInput) {
      return options.result ?? Object.freeze({
        schemaVersion: "mounted-runtime-authority-reverification.v1" as const,
        ok: true as const,
        workspaceId,
        mountInstanceId,
        workspaceIdentityEventId,
        policyVersion,
        sourceHighWaterMark: authorityHighWaterMark,
        runId: input.runId
      });
    }
  });
}

function verifyForRun(overrides: Partial<{
  readonly mountInstanceId: string;
  readonly requiredContextPackIds: readonly string[];
}> = {}) {
  return {
    schemaVersion: "verify-mounted-context-for-run.v1" as const,
    workspaceId,
    mountInstanceId: overrides.mountInstanceId ?? mountInstanceId,
    workspaceIdentityEventId,
    policyVersion,
    sourceHighWaterMark: authorityHighWaterMark,
    runId: "run_context_a",
    requiredContextPackIds: overrides.requiredContextPackIds ?? ["workspace-runtime-status.v1"]
  };
}

function operationalProvider(build: BuildSpy): OperationalContextPackProvider {
  return {
    providerId: "runtime_context_test_provider",
    capabilities: ["workspace-runtime-status", "task-run-history", "agent-memory-summary"],
    policyVersion,
    generatedAt: now,
    scope: { kind: "workspace", id: workspaceId },
    sizeBudgets: { workspaceRuntimeStatus: 16_384, taskRunHistory: 32_768, agentMemorySummary: 16_384 },
    workspaceRuntimeStatus: async () => {
      build();
      return {
        runtimeHighWaterMark: 42,
        workspaceMounted: true,
        workspaceId,
        storageStrategy: "repo-local",
        bindPosture: "loopback",
        authPosture: "local-disabled",
        providerStates: [],
        diagnostics: [],
        projectionHighWaterMarks: { agent: 42 },
        omissionCodes: []
      };
    },
    async taskRunHistorySnapshot() {
      return {
        projectionHighWaterMark: 42,
        projectionSourceRef: "agent.projection.task-run-history",
        tasks: [], runs: [], modelInvocations: [], toolRequests: [],
        aggregateCounts: { total: 0 }, sourceEventIds: [], artifactHashes: [],
        window: { order: "updatedAt:desc", limit: 25, hasMore: false, totalCount: 0, omissionCodes: [] },
        emptyProof: {
          projectionName: "agent.projection.task-run-history",
          scope: { kind: "workspace", id: workspaceId },
          projectionHighWaterMark: 42,
          sourceEventCount: 0,
          generatedAt: now,
          emptyReasonCode: "empty"
        }
      };
    },
    async agentMemorySnapshot() {
      return {
        projectionHighWaterMark: 42,
        projectionSourceRef: "agent.projection.memory",
        activeMemory: [], aggregateCounts: { active: 0, totalCount: 0 },
        sourceEventIds: [], artifactHashes: [],
        window: { order: "createdAt:asc", limit: 25, hasMore: false, totalCount: 0, omissionCodes: [] },
        emptyProof: {
          projectionName: "agent.projection.memory",
          scope: { kind: "workspace", id: workspaceId },
          projectionHighWaterMark: 42,
          sourceEventCount: 0,
          generatedAt: now,
          emptyReasonCode: "empty"
        }
      };
    }
  };
}

function prrRegistration(build: BuildSpy): PrrContextPackRegistrationEntry {
  const descriptor = Object.freeze({
    contextPackId: "prr-read-model.v1",
    version: 1,
    label: "Selected request PRR read model",
    maxBytes: 32_768,
    requiredProvenanceKinds: ["event-id", "content-hash"],
    redactionPolicy: "safe-normalized-summary",
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
    contextPackId: "jurisdiction-pack-summary.v1",
    version: 1,
    label: "Selected request jurisdiction pack summary",
    maxBytes: 16_384,
    requiredProvenanceKinds: ["event-id", "content-hash"],
    redactionPolicy: "safe-normalized-summary",
    sourceProjection: "prr.jurisdiction-pack.selected-request"
  });
  return Object.freeze({
    descriptor,
    payloadParser: jurisdictionPackSummaryPayloadParser,
    registrationIdentity: "packages/agent/prr-context-packs:jurisdiction-pack-summary.v1@1",
    builder: Object.freeze({
      descriptor,
      build: () => buildJurisdictionPackSummaryContextPack({
        generatedAt: now,
        policyVersion,
        scope: { kind: "prr-request", id: "prr_req_selected" },
        selectedRequestEventId: "evt_prr_selected_created",
        selectedRequestJurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
        jurisdictionPack: {
          name: "us-federal-foia",
          version: "0.1.0",
          jurisdiction: "US Federal",
          description: "Federal FOIA starter jurisdiction pack.",
          agentGuidance: "Use cited rules as advisory workflow guidance.",
          rules: [{
            id: "federal-determination-20-working-days",
            label: "20 working days determination estimate",
            kind: "deadline",
            description: "Federal timing guidance.",
            citations: [{
              label: "5 U.S.C. 552(a)(6)(A)(i)",
              citation: "5 U.S.C. 552(a)(6)(A)(i)",
              url: "https://www.justice.gov/oip/freedom-information-act-5-usc-552"
            }],
            agentWarning: "Confirm tolling facts before legal escalation language."
          }]
        },
        jurisdictionArtifactHash: `sha256:${"a".repeat(64)}`,
        projectionHighWaterMark: 77,
        sizeBudgetBytes: 16_384
      })
    })
  });
}

function buildSelectedPrrPack() {
  const bodyHash = `sha256:${"b".repeat(64)}` as const;
  const evidenceHash = `sha256:${"c".repeat(64)}` as const;
  return buildPrrReadModelContextPack({
    generatedAt: now,
    policyVersion,
    scope: { kind: "prr-request", id: "prr_req_selected" },
    request: {
      prrRequestId: "prr_req_selected",
      status: "sent",
      agencyName: "Selected Agency",
      jurisdictionPack: { name: "us-federal-foia", version: "0.1.0" },
      agency: { name: "Selected Agency", email: "foia@example.gov" },
      requester: { name: "Investigator", email: "investigator@example.org" },
      requestText: "Safe request summary.",
      latestOutboundCorrespondence: {
        correspondenceId: "corr_selected",
        provider: "gmail",
        providerMessageId: "msg_selected",
        subject: "Selected PRR follow-up",
        occurredAt: now,
        bodyHash,
        evidenceIds: ["ev_selected"],
        attachmentEvidenceIds: ["ev_selected"],
        approvedBy: "actor_investigator"
      },
      productionBatches: [], productionEvidenceIds: [], exemptions: [],
      possibleStalling: false, confirmedStalling: false, stallingSignals: []
    },
    timeline: [{ eventId: "evt_prr_selected_created", type: "prr.request.created", occurredAt: now, payload: { prrRequestId: "prr_req_selected" } as never }],
    requestStream: {
      requestCreatedEventId: "evt_prr_selected_created",
      streamHeadEventId: "evt_prr_selected_created",
      streamHighWaterMark: 9,
      sourceEventIds: ["evt_prr_selected_created"]
    },
    projectionHighWaterMark: 77,
    workspace: { totalPrrRequestCount: 1 },
    correspondenceHashes: [{ id: "corr_selected_body", contentHash: bodyHash, sourceEventId: "evt_prr_selected_created" }],
    evidenceHashes: [{ id: "ev_selected", contentHash: evidenceHash, sourceEventId: "evt_prr_selected_created" }],
    gates: [],
    sizeBudgetBytes: 32_768
  });
}

function investigativeRegistration(build: BuildSpy): RegisterInvestigativeContextPacksInput {
  const contentHash = `sha256:${"d".repeat(64)}` as const;
  const body: InvestigativeSelectionManifestBody = {
    manifestVersion: "investigative-selection-manifest.v1",
    scope: { kind: "workspace", id: workspaceId },
    sourceProjectionHighWaterMarks: { ingestion: 42, graph: 41 },
    ordering: "ref-kind-ref-id-content-hash-v1",
    window: { cursor: "cursor_001", offset: 0, limit: 1, stableSort: "ref-kind-ref-id-content-hash-v1" },
    totalEligibleCount: 1,
    includedRefs: [{
      refKind: "evidence",
      refId: "ev_context_001",
      sortKey: `evidence/ev_context_001/${contentHash}`,
      contentHash,
      sourceEventIds: ["evt_evidence_ingested_001"],
      mandatory: true
    }],
    aggregateOmissions: []
  };
  const manifest = Object.freeze({ ...body, manifestHash: buildSelectionManifestHash(body) });
  const evidence: InvestigativeEvidenceRow = {
    evidenceId: "ev_context_001",
    ingestionEventId: "evt_evidence_ingested_001",
    contentHash,
    occurrenceIds: [],
    parseJobs: [],
    governanceTags: []
  };
  const deps: InvestigativeContextPackDependencies = {
    selection: { capabilityVersion: "investigative-selection.v1", select: async () => manifest },
    evidenceReader: { readEvidenceByIds: async () => {
      build();
      return [evidence];
    } },
    graphReader: { readAcceptedGraphByIds: async () => ({ assertions: [], entities: [], relationships: [], relationshipProjectionAvailable: true }) },
    governanceReader: { readActiveRestrictionsByIds: async () => [] },
    agentLockReader: { readActiveLocksByIds: async () => [] },
    eventReader: { readEventsByIds: async () => [] },
    evidenceSourcePosture: {
      postureVersion: "ingestion-current-source-posture.v1",
      checkEvidence: async () => ({ ok: true as const, stalenessInputs: [{ kind: "source-byte-current-hash", ref: evidence.evidenceId, value: evidence.contentHash }] })
    },
    now: () => now,
    policyVersion,
    ontologyCoreVersion: "ontology.v1",
    packVersions: { ingestion: "ingestion.v1" },
    registrationIdentity: investigativeRegistrationIdentity
  };
  return { deps, scope: { kind: "workspace", id: workspaceId }, window: body.window };
}
